import { registerUserSchema } from "../validators/register-validator.js";
import { loginUserSchema, changePasswordSchema } from "../validators/login-validator.js";
import { registerUser, loginUser, changePassword as changePasswordService } from "../services/user-register-service.js";
import { signAuthToken, setAuthCookie, clearAuthCookie, STUDENT_COOKIE } from "../services/token-service.js";
import User from "../models/user-auth-models.js";
import { publicUser } from "../utils/public-user.js";
import { handleAuthError as handleError } from "../utils/handle-auth-error.js";

export const register = async (req, res) => {
  try {
    const data = registerUserSchema.parse(req.body);
    const user = await registerUser(data);
    return res.status(201).json({
      success: true,
      message: "User registered successfully",
      data: { user: publicUser(user) },
    });
  } catch (error) {
    return handleError(res, error, "register");
  }
};

export const login = async (req, res) => {
  try {
    const data = loginUserSchema.parse(req.body);
    const user = await loginUser(data);
    const token = signAuthToken(user);
    setAuthCookie(res, token, STUDENT_COOKIE);

    return res.status(200).json({
      success: true,
      message: "Login successful",
      data: { user: publicUser(user) },
    });
  } catch (error) {
    return handleError(res, error, "login");
  }
};

export const logout = async (req, res) => {
  try {
    clearAuthCookie(res, STUDENT_COOKIE);
    return res.status(200).json({
      success: true,
      message: "Logged out successfully",
    });
  } catch (error) {
    return handleError(res, error, "logout");
  }
};

export const me = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }
    return res.status(200).json({
      success: true,
      data: { user: publicUser(user) },
    });
  } catch (error) {
    return handleError(res, error, "me");
  }
};

export const changePassword = async (req, res) => {
  try {
    const data = changePasswordSchema.parse(req.body);
    await changePasswordService(req.user.id, data);
    return res.status(200).json({
      success: true,
      message: "Password changed successfully",
    });
  } catch (error) {
    return handleError(res, error, "changePassword");
  }
};
