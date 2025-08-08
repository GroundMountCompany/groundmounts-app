// src/lib/resendSafe.ts
import { Resend } from "resend";

export function getResendOrThrow() {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    throw new Error("RESEND_API_KEY is not set");
  }
  return new Resend(key);
}