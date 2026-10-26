import { cookies } from "next/headers";

/** Cookie preferring which household to load when the user has several memberships. */
export const ACTIVE_HOUSEHOLD_COOKIE = "ff_active_household";

const MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export async function getPreferredHouseholdId(): Promise<string | null> {
  const store = await cookies();
  const value = store.get(ACTIVE_HOUSEHOLD_COOKIE)?.value;
  if (!value || !/^[0-9a-f-]{36}$/i.test(value)) {
    return null;
  }
  return value;
}

export async function setPreferredHouseholdId(householdId: string): Promise<void> {
  const store = await cookies();
  store.set(ACTIVE_HOUSEHOLD_COOKIE, householdId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}
