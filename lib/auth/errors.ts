import { NextResponse } from "next/server";
import { ZodError } from "zod";

import type { AuthServiceError } from "@/services/auth-service";

export function jsonError(
  status: number,
  message: string,
  details?: unknown,
) {
  return NextResponse.json(
    {
      error: message,
      details: details ?? null,
    },
    { status },
  );
}

export function fromZodError(error: ZodError) {
  return jsonError(400, "Validation failed", error.flatten());
}

export function fromAuthServiceError(error: AuthServiceError) {
  const status =
    error.code === "VALIDATION" ? 400 : error.code === "AUTH" ? 401 : 500;
  return jsonError(status, error.message, { code: error.code });
}
