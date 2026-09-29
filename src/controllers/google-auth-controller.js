import { checkRegNoSchema, googleAuthSchema } from "../validators/google-auth-validator.js";
import { checkRegNo as checkRegNoService, googleAuthenticate } from "../services/google-auth-service.js";
import { signAuthToken, setAuthCookie, STUDENT_COOKIE } from "../services/token-service.js";
import { publicUser } from "../utils/public-user.js";
import { handleAuthError } from "../utils/handle-auth-error.js";

export const checkRegNo = async (req, res) => {
  try {
    const { regNo } = checkRegNoSchema.parse(req.body);
    const data = await checkRegNoService(regNo);
    return res.status(200).json({
      success: true,
      message: "Registration number verified",
      data,
    });
  } catch (error) {
    return handleAuthError(res, error, "checkRegNo");
  }
};

export const googleAuth = async (req, res) => {
  try {
    const { regNo, idToken } = googleAuthSchema.parse(req.body);
    const user = await googleAuthenticate({ regNo, idToken });

    const token = signAuthToken(user);
    setAuthCookie(res, token, STUDENT_COOKIE);

    return res.status(200).json({
      success: true,
      message: "Signed in successfully",
      data: { user: publicUser(user) },
    });
  } catch (error) {
    return handleAuthError(res, error, "googleAuth");
  }
};
