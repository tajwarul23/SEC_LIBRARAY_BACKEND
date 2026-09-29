import { z } from "zod";

export const registerUserSchema = z.object({
  name: z.string().trim().min(2).max(100),
  regNo: z.string().trim().min(1).max(50),
  email: z.string().trim().email().toLowerCase(),
  password: z
    .string()
    .min(8)
    .max(128)
    .regex(/[A-Z]/, "Password must contain an uppercase letter")
    .regex(/[a-z]/, "Password must contain a lowercase letter")
    .regex(/[0-9]/, "Password must contain a number"),
  department: z.string().trim().min(1).max(100),
  Session: z.string().trim().min(1).max(50),
  gender: z.enum(["Male", "Female", "Hijra"]),
});
