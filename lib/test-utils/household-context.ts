import type { HouseholdContext } from "@/lib/auth/household";

export const TEST_USER_ID = "11111111-1111-1111-1111-111111111111";
export const TEST_HOUSEHOLD_ID = "33333333-3333-3333-3333-333333333333";

/** Household context for service tests (owner by default). */
export function makeCtx(overrides?: Partial<HouseholdContext>): HouseholdContext {
  return {
    user: {
      id: TEST_USER_ID,
      email: "owner@example.com",
      app_metadata: {},
      user_metadata: {},
      aud: "authenticated",
      created_at: "2026-01-01T00:00:00.000Z",
    } as HouseholdContext["user"],
    membershipId: "22222222-2222-2222-2222-222222222222",
    householdId: TEST_HOUSEHOLD_ID,
    role: "owner",
    displayName: "Owner",
    currency: "EUR",
    householdName: "Test Family",
    ...overrides,
  };
}

/**
 * Minimal chainable stand-in for a supabase-js query builder: every filter
 * method returns the chain, and awaiting it (or .single/.maybeSingle)
 * yields `result`.
 */
export function queryChain<T>(result: { data: T; error: null | { message: string }; count?: number }) {
  const chain: Record<string, unknown> = {};
  const passthrough = [
    "select",
    "insert",
    "update",
    "delete",
    "upsert",
    "eq",
    "neq",
    "in",
    "is",
    "gte",
    "lte",
    "lt",
    "gt",
    "or",
    "not",
    "order",
    "range",
    "limit",
  ];
  for (const method of passthrough) {
    chain[method] = () => chain;
  }
  chain.single = async () => result;
  chain.maybeSingle = async () => result;
  chain.then = (resolve: (value: typeof result) => unknown) => resolve(result);
  return chain;
}
