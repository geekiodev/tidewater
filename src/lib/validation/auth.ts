import { z } from "zod";

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, "Email is too long")
  .pipe(z.email("Enter a valid email address"));

// Supabase Auth enforces the full policy (see supabase/config.toml); this is
// the first check plus an upper bound so huge payloads are rejected early.
export const passwordSchema = z
  .string()
  .min(12, "Use at least 12 characters")
  .max(128, "Password is too long");

export const workspaceNameSchema = z
  .string()
  .trim()
  .min(1, "Enter your agency's name")
  .max(100, "Keep the name under 100 characters");

export const inviteTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/, "Invalid invitation link");

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Enter your password").max(128),
  next: z.string().max(512).optional(),
});

export const signupSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("workspace"),
    email: emailSchema,
    password: passwordSchema,
    workspaceName: workspaceNameSchema,
  }),
  z.object({
    mode: z.literal("invite"),
    email: emailSchema,
    password: passwordSchema,
    inviteToken: inviteTokenSchema,
  }),
]);

export const inviteSchema = z.object({ email: emailSchema });

export const uuidSchema = z.uuid();
