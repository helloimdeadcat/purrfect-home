import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import manifest from "./manifest";

const publicDir = path.join(process.cwd(), "public");

describe("web app manifest", () => {
  const m = manifest();

  it("is installable: name, standalone display, start inside the app", () => {
    expect(m.name).toBe("Purrfect Home");
    expect(m.display).toBe("standalone");
    expect(m.start_url).toBe("/app/dashboard");
  });

  it("ships 192 and 512 PNG icons plus a maskable one, all present on disk", () => {
    const sizes = (m.icons ?? []).map((icon) => icon.sizes);
    expect(sizes).toEqual(expect.arrayContaining(["192x192", "512x512"]));
    expect((m.icons ?? []).some((icon) => icon.purpose === "maskable")).toBe(true);
    for (const icon of m.icons ?? []) {
      const file = path.join(publicDir, icon.src);
      expect(existsSync(file), icon.src).toBe(true);
      const signature = readFileSync(file).subarray(0, 8);
      expect([...signature]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    }
  });
});

describe("service worker", () => {
  const sw = readFileSync(path.join(publicDir, "sw.js"), "utf8");

  it("only caches the static offline page", () => {
    const cached = [...sw.matchAll(/cache\.(?:add|addAll|put)\(/g)];
    expect(cached).toHaveLength(1);
    expect(sw).toContain('const OFFLINE_URL = "/offline.html"');
  });

  it("only handles page navigations — never API, RSC or receipt requests", () => {
    expect(sw).toContain('request.mode !== "navigate"');
    expect(sw).not.toMatch(/\/api\//);
  });
});
