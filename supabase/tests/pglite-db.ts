/**
 * Test-only harness: applies every migration in supabase/migrations to an
 * in-process Postgres (PGlite) with minimal Supabase stand-ins — the
 * anon/authenticated/service_role roles, auth.users + auth.uid(), the
 * storage schema and pgcrypto in `extensions`. Lets RLS policies, triggers
 * and RPCs be exercised for real instead of grepping SQL text.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

const MIGRATIONS_DIR = path.join(process.cwd(), "supabase/migrations");

const SUPABASE_STUBS = `
  CREATE ROLE anon NOLOGIN;
  CREATE ROLE authenticated NOLOGIN;
  CREATE ROLE service_role NOLOGIN BYPASSRLS;
  CREATE SCHEMA extensions;
  CREATE EXTENSION pgcrypto SCHEMA extensions;
  CREATE SCHEMA auth;
  CREATE TABLE auth.users (id uuid PRIMARY KEY, email text);
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
    $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
  GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;
  CREATE SCHEMA storage;
  CREATE TABLE storage.buckets (id text PRIMARY KEY, name text, public boolean,
    file_size_limit bigint, allowed_mime_types text[]);
  CREATE TABLE storage.objects (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    bucket_id text, name text, owner uuid);
  ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
  CREATE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE sql AS
    $$ SELECT (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
  GRANT USAGE ON SCHEMA storage TO authenticated, service_role;
  GRANT ALL ON storage.objects TO authenticated, service_role;
`;

export function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith(".sql"))
    .sort();
}

export function readMigration(file: string): string {
  return readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
}

/**
 * @param options.before  apply only migrations whose 14-digit timestamp is
 *   lower than this — reproduces an older remote schema.
 */
export async function createMigratedDb(options?: { before?: string }): Promise<PGlite> {
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(SUPABASE_STUBS);
  const files = migrationFiles().filter(
    (file) => !options?.before || file.slice(0, 14) < options.before,
  );
  for (const file of files) {
    try {
      await db.exec(readMigration(file));
    } catch (error) {
      throw new Error(
        `Migration ${file} failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  return db;
}

/** Run one statement as an authenticated end user (RLS + triggers apply). */
export async function asUser<T = Record<string, unknown>>(
  db: PGlite,
  userId: string,
  sql: string,
  params?: unknown[],
) {
  await db.exec(
    `RESET ROLE; SELECT set_config('request.jwt.claim.sub', '${userId}', false); SET ROLE authenticated;`,
  );
  try {
    return await db.query<T>(sql, params);
  } finally {
    await db.exec(
      "RESET ROLE; SELECT set_config('request.jwt.claim.sub', '', false);",
    );
  }
}

/**
 * Resolves when the statement was blocked — either it raised, or RLS
 * filtered it down to zero affected rows.
 */
export async function expectBlocked(
  run: Promise<{ affectedRows?: number }>,
): Promise<void> {
  let result: { affectedRows?: number };
  try {
    result = await run;
  } catch {
    return;
  }
  if (result.affectedRows === 0) return;
  throw new Error("Expected statement to be blocked, but it succeeded");
}
