import "server-only";
import { createHash, randomBytes } from "node:crypto";

/** 256-bit random token, URL-safe (43 chars). Only its hash is stored. */
export function generateInviteToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Must match the hashing in public.accept_invitation(). */
export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}
