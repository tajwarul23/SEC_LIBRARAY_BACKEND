import { z } from "zod";

export const loginUserSchema = z.object({
  regNo: z.string().trim().min(1).max(50),
  password: z.string().min(1),
});

const passwordRules = z
  .string()
  .min(8)
  .max(128)
  .regex(/[A-Z]/, "Password must contain an uppercase letter")
  .regex(/[a-z]/, "Password must contain a lowercase letter")
  .regex(/[0-9]/, "Password must contain a number");

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: passwordRules,
});