import { Notification } from "../models/notification-model.js";
import { Waitlist } from "../models/waitlist-model.js";
import { Book } from "../models/book-model.js";
import { clampLimit, clampOffset } from "../utils/pagination.js";

export async function createBookAvailableNotification({
  userId,
  bookId,
  waitlistId,
  userName,
  userRegNo,
  userDepartment,
  userSession,
}) {
  const book = await Book.findById(bookId).select("title authors").lean();
  const bookTitle = book?.title || "your book";

  const notification = await Notification.create({
    user: userId,
    type: "BOOK_AVAILABLE",
    title: `Book available: ${bookTitle}`,
    message: `The book "${bookTitle}" you were waiting for is now available. Reserve it before someone else does.`,
    book: bookId,
    bookTitle,
    relatedId: waitlistId ? String(waitlistId) : null,
    userName: userName ?? null,
    userRegNo: userRegNo ?? null,
    userDepartment: userDepartment ?? null,
    userSession: userSession ?? null,
    read: false,
  });

  return notification;
}

export async function createFineClearedNotification({ userId, userName, userRegNo, amount }) {
  const notification = await Notification.create({
    user: userId,
    type: "FINE_CLEARED",
    title: "Fine cleared",
    message: `Your library fine of ৳${amount} has been cleared. Thank you for your payment.`,
    relatedId: null,
    userName: userName ?? null,
    userRegNo: userRegNo ?? null,
    read: false,
  });

  return notification;
}

export async function triggerWaitlistAvailability(bookId, availableCopies = 1) {
  if (!bookId) return null;

  const pickedEntries = await Waitlist.find({
    book: bookId,
    isActive: true,
    notified: false,
  })
    .sort({ createdAt: 1 })
    .lean();

  if (pickedEntries.length === 0) {
    return { notified: [], notifiedCount: 0, waitlistIds: [] };
  }

  const waitlistIds = pickedEntries.map((entry) => entry._id);

  const notifications = await Promise.all(
    pickedEntries.map((entry) =>
      createBookAvailableNotification({
        userId: entry.user,
        bookId,
        waitlistId: entry._id,
        userName: entry.name,
        userRegNo: entry.regNo,
        userDepartment: entry.department,
        userSession: entry.Session,
      })
    )
  );

  await Waitlist.deleteMany({ _id: { $in: waitlistIds } });

  return {
    notified: notifications,
    notifiedCount: notifications.length,
    waitlistIds,
  };
}

export async function getMyNotifications(userId, query = {}) {
  const offset = clampOffset(query.offset);
  const limit = clampLimit(query.limit, 20);
  const onlyUnread = query.unread === "true";

  const filter = {
    user: userId,
    ...(onlyUnread ? { read: false } : {}),
  };

  const [totalCount, notifications, unreadCount] = await Promise.all([
    Notification.countDocuments(filter),
    Notification.find(filter).sort({ createdAt: -1 }).skip(offset).limit(limit).lean(),
    Notification.countDocuments({ user: userId, read: false }),
  ]);

  return {
    notifications,
    totalCount,
    unreadCount,
    offset,
    limit,
  };
}

export async function markNotificationRead(userId, notificationId) {
  return Notification.findOneAndUpdate(
    { _id: notificationId, user: userId },
    { $set: { read: true, readAt: new Date() } },
    { new: true }
  );
}

export async function markAllNotificationsRead(userId) {
  const result = await Notification.updateMany(
    { user: userId, read: false },
    { $set: { read: true, readAt: new Date() } }
  );

  return {
    modifiedCount: result.modifiedCount || 0,
  };
}