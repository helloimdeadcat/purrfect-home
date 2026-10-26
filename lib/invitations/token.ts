import { createHash, randomBytes } from "node:crypto";

/** Cryptographically strong invite token (URL-safe). Never store raw token in DB. */
export function generateInviteToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function buildInviteUrl(origin: string, token: string): string {
  const url = new URL("/invite", origin);
  url.searchParams.set("token", token);
  return url.toString();
}
