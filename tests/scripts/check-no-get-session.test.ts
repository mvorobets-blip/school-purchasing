import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { repoRoot, runScript } from "./run-script";

// Кожен випадок — тимчасовий проєкт із одним файлом src/lib/auth.ts.
const temps: string[] = [];

function project(code: string) {
  const dir = mkdtempSync(path.join(os.tmpdir(), "no-get-session-"));
  temps.push(dir);
  mkdirSync(path.join(dir, "src", "lib"), { recursive: true });
  writeFileSync(path.join(dir, "src", "lib", "auth.ts"), code);
  return dir;
}

afterAll(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true });
});

describe("check-no-get-session", () => {
  it("пропускає getClaims() і згадки getSession у коментарях", () => {
    const dir = project(
      [
        "// getSession() для авторизації НЕ використовуємо.",
        "/* і тут: supabase.auth.getSession() */",
        'const url = "https://example.test/path";',
        "const { data } = await supabase.auth.getClaims();",
      ].join("\n"),
    );
    const { code, out } = runScript("check-no-get-session.mjs", dir);
    expect(code).toBe(0);
    expect(out).toContain("OK");
  });

  it("падає на виклик getSession() з файлом і рядком", () => {
    const dir = project(["const a = 1;", "const { data } = await supabase.auth.getSession();"].join("\n"));
    const { code, out } = runScript("check-no-get-session.mjs", dir);
    expect(code).toBe(1);
    expect(out).toContain("src/lib/auth.ts:2");
  });

  it("падає на посилання без виклику", () => {
    const dir = project("const read = supabase.auth.getSession;");
    expect(runScript("check-no-get-session.mjs", dir).code).toBe(1);
  });

  it("код після коментаря в тому самому рядку перевіряється", () => {
    const dir = project("/* коментар */ await supabase.auth.getSession();");
    expect(runScript("check-no-get-session.mjs", dir).code).toBe(1);
  });

  it("чинний код репозиторію проходить", () => {
    expect(runScript("check-no-get-session.mjs", repoRoot).code).toBe(0);
  });
});
