/**
 * Receipts Storage conventions. The bucket is private (init migration);
 * files are served only through short-lived signed URLs.
 */

export const RECEIPTS_BUCKET = "receipts" as const;

/** Signed download links live just long enough for the redirect. */
export const RECEIPT_SIGNED_URL_TTL_SECONDS = 60;

/**
 * Object path: {householdId}/{transactionId}/{objectId}.{extension}
 * Must match RLS policies that read the first path segment as household_id.
 * The object name is server-generated (never the client's file name) so
 * uploads cannot collide with or overwrite existing objects.
 */
export function buildReceiptStoragePath(params: {
  householdId: string;
  transactionId: string;
  objectId: string;
  extension: string;
}): string {
  return `${params.householdId}/${params.transactionId}/${params.objectId}.${params.extension}`;
}
