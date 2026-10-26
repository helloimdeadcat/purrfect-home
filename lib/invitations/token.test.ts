import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  buildInviteUrl,
  generateInviteToken,
  hashInviteToken,
} from "./token";

describe("invite token helpers", () => {
  it("generates URL-safe high-entropy tokens", () => {
    const a = generateInviteToken();
    const b = generateInviteToken();
    expect(a).not.toEqual(b);
    expect(a.length).toBeGreaterThanOrEqual(40);
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("hashes with SHA-256 hex (never stores raw token)", () => {
    const token = generateInviteToken();
    const hash = hashInviteToken(token);
    expect(hash).toHaveLength(64);
    expect(hash).toBe(
      createHash("sha256").update(token, "utf8").digest("hex"),
    );
    expect(hash).not.toContain(token);
  });

  it("builds invite URL with token query param", () => {
    const url = buildInviteUrl("http://localhost:3000", "abc123tokenvaluexxxxx");
    expect(url).toBe(
      "http://localhost:3000/invite?token=abc123tokenvaluexxxxx",
    );
  });
});
