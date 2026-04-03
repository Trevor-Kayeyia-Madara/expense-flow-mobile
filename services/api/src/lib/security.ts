import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export function newRefreshToken() {
  return randomBytes(32).toString("hex"); // 64 chars
}

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function safeTokenEqual(a: string, b: string) {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

