/**
 * Web Push (VAPID) configuration. SERVER ONLY — VAPID_PRIVATE_KEY must never
 * reach the browser. When any variable is missing, push is disabled and all
 * push helpers are silent no-ops.
 */
export type VapidConfig = {
  publicKey: string;
  privateKey: string;
  subject: string;
};

export function getVapidConfig(): VapidConfig | null {
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  const subject = process.env.VAPID_SUBJECT?.trim();
  if (!publicKey || !privateKey || !subject) return null;
  return { publicKey, privateKey, subject };
}

export function isPushConfigured(): boolean {
  return getVapidConfig() !== null;
}

/** The public key is not secret; Settings hands it to the browser. */
export function getVapidPublicKey(): string | null {
  return getVapidConfig()?.publicKey ?? null;
}

/** Request header set by proxy.ts so route handlers know the HTTP method. */
export const REQUEST_METHOD_HEADER = "x-ph-request-method";
