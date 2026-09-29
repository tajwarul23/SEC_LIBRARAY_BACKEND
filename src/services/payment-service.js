import crypto from "node:crypto";
import User from "../models/user-auth-models.js";
import { Transaction } from "../models/transaction-model.js";
import { sslcz } from "../config/sslcommerz.js";
import { clampLimit, clampOffset } from "../utils/pagination.js";
import { createFineClearedNotification } from "./notification-service.js";

const CURRENCY = "BDT";

export async function initFinePayment(reqUser) {
  const user = await User.findById(reqUser.id).select("name regNo email fine").lean();

  if (!user) {
    const error = new Error("User not found");
    error.statusCode = 404;
    throw error;
  }

  if (!user.fine || user.fine <= 0) {
    const error = new Error("No outstanding fine to pay");
    error.statusCode = 400;
    throw error;
  }

  const backendUrl = process.env.BACKEND_URL;
  const tran_id = `FINE-${crypto.randomUUID()}`;
  const amount = user.fine;

  const transaction = await Transaction.create({
    user: user._id,
    userName: user.name,
    userRegNo: user.regNo,
    tran_id,
    amount,
    currency: CURRENCY,
    status: "PENDING",
  });

  const initData = {
    total_amount: amount,
    currency: CURRENCY,
    tran_id,
    success_url: `${backendUrl}/api/payment/sslcommerz/success`,
    fail_url: `${backendUrl}/api/payment/sslcommerz/fail`,
    cancel_url: `${backendUrl}/api/payment/sslcommerz/cancel`,
    ipn_url: `${backendUrl}/api/payment/sslcommerz/ipn`,
    shipping_method: "NO",
    product_name: "Library Fine Clearance",
    product_category: "Library Fine",
    product_profile: "general",
    cus_name: user.name,
    cus_email: user.email,
    cus_add1: "Sylhet Engineering College",
    cus_city: "Sylhet",
    cus_state: "Sylhet",
    cus_postcode: "3100",
    cus_country: "Bangladesh",
    // Students have no phone on file; SSLCommerz requires the field
    cus_phone: "N/A",
  };

  const apiResponse = await sslcz.init(initData);

  if (!apiResponse?.GatewayPageURL) {
    transaction.status = "FAILED";
    transaction.gatewayResponse = apiResponse;
    await transaction.save();

    const error = new Error("Failed to initiate payment gateway session");
    error.statusCode = 502;
    throw error;
  }

  return { gatewayUrl: apiResponse.GatewayPageURL, tran_id, amount };
}

// Only trusted entry point for clearing a fine. Never trust the raw IPN/redirect
// POST body directly — always re-verify with SSLCommerz's own validation API
// before touching the user's fine, since the browser-facing redirect and the
// unauthenticated IPN body can both be spoofed by anyone who can guess a tran_id.
export async function handleIpnValidation(body) {
  const { val_id, tran_id } = body || {};
  if (!val_id || !tran_id) return;

  let transaction = await Transaction.findOne({ tran_id });
  if (!transaction) return;

  if (transaction.status !== "VALID") {
    const validation = await sslcz.validate({ val_id });

    const isValid =
      (validation?.status === "VALID" || validation?.status === "VALIDATED") &&
      validation?.tran_id === tran_id &&
      Number(validation?.amount) === transaction.amount &&
      validation?.currency === transaction.currency;

    if (!isValid) {
      await Transaction.updateOne(
        { tran_id, status: { $ne: "VALID" } },
        {
          $set: {
            val_id,
            gatewayResponse: validation,
            status: validation?.status === "FAILED" ? "FAILED" : transaction.status,
          },
        }
      );
      return;
    }

    // Atomic claim: only one concurrent IPN delivery for this tran_id can win
    // the transition out of PENDING, so a duplicate/replayed IPN can't double-apply.
    const claimed = await Transaction.findOneAndUpdate(
      { tran_id, status: { $ne: "VALID" } },
      { $set: { status: "VALID", val_id, gatewayResponse: validation } },
      { new: true }
    );

    // If claimed is null, a concurrent delivery already won that race — fall
    // through to applyFineForTransaction below regardless, since that step
    // is independently retryable and may not have completed yet either way.
    transaction = claimed || (await Transaction.findOne({ tran_id }));
    if (!transaction) return;
  }

  await applyFineForTransaction(transaction);
}

// Applies the fine decrement for an already-VALID transaction. Idempotent and
// safe to call repeatedly or concurrently — only the caller that wins the
// fineApplied claim actually touches the fine — so it can be retried later
// (e.g. from getMyPaymentStatus) if this step previously failed without
// re-validating with SSLCommerz or risking a double-decrement.
async function applyFineForTransaction(transaction) {
  if (transaction.status !== "VALID" || transaction.fineApplied) return;

  const claimed = await Transaction.findOneAndUpdate(
    { _id: transaction._id, status: "VALID", fineApplied: { $ne: true } },
    { $set: { fineApplied: true } },
    { new: true }
  );

  if (!claimed) return;

  // Atomic, pipeline-based update: clamps at 0 and never collides with the
  // cron job's concurrent $inc on the same fine field. Requires
  // `updatePipeline: true` for Mongoose to accept an array update.
  const updatedUser = await User.findOneAndUpdate(
    { _id: claimed.user },
    [{ $set: { fine: { $max: [{ $subtract: [{ $ifNull: ["$fine", 0] }, claimed.amount] }, 0] } } }],
    { new: true, updatePipeline: true }
  );

  if (updatedUser) {
    await createFineClearedNotification({
      userId: updatedUser._id,
      userName: updatedUser.name,
      userRegNo: updatedUser.regNo,
      amount: claimed.amount,
    });
  }
}

// Called from the fail/cancel browser redirects. Only a still-PENDING
// transaction is closed, and never a VALID one: if a (spoofed or early)
// redirect closes it and SSLCommerz later validates the payment, the IPN
// handler's `status: { $ne: "VALID" }` claim still marks it VALID and
// clears the fine.
export async function closePendingTransaction(tran_id, status) {
  if (typeof tran_id !== "string" || !tran_id) return;
  await Transaction.updateOne({ tran_id, status: "PENDING" }, { $set: { status } });
}

export async function getMyPaymentHistory(userId, query = {}) {
  const offset = clampOffset(query.offset);
  const limit = clampLimit(query.limit, 20);

  const [totalCount, transactions] = await Promise.all([
    Transaction.countDocuments({ user: userId }),
    Transaction.find({ user: userId }).sort({ createdAt: -1 }).skip(offset).limit(limit).lean(),
  ]);

  return { transactions, totalCount, offset, limit };
}

export async function getMyPaymentStatus(userId, tran_id) {
  const transaction = await Transaction.findOne({ user: userId, tran_id });
  if (!transaction) return null;

  // Self-heals a VALID transaction whose fine-application step previously
  // failed — the payment-result page polls this endpoint right after
  // checkout, so a stuck payment recovers on its own the next time it's
  // checked, with no manual intervention needed.
  if (transaction.status === "VALID" && !transaction.fineApplied) {
    await applyFineForTransaction(transaction);
    return Transaction.findOne({ user: userId, tran_id }).lean();
  }

  return transaction.toObject();
}

export async function getAllPaymentsForAdmin(query = {}) {
  const offset = clampOffset(query.offset);
  const limit = clampLimit(query.limit, 20);
  const { regNo, status } = query;

  const filter = {};
  if (regNo) filter.userRegNo = String(regNo).trim();
  if (status) filter.status = status;

  const [totalCount, transactions] = await Promise.all([
    Transaction.countDocuments(filter),
    Transaction.find(filter).sort({ createdAt: -1 }).skip(offset).limit(limit).lean(),
  ]);

  return { transactions, totalCount, offset, limit };
}
