// Дія 5 з postmortem docs/incidents/2026-11-23-staging-supabase-url.md: алерт у Telegram містить перший рядок ::error
// smoke. Технічні тести — без AC ID (операційна вимога, не AC PM).
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MAX_REASON, firstError } from "../../scripts/smoke-first-error.mjs";
import { repoRoot } from "./run-script";

// Рядки — у форматі scripts/smoke.mjs: `::error title=smoke ${base}::${f}`.
const DRILL = [
  '{"base":"https://school-purchasing-8ggplxxaz-mvorobets-blip.vercel.app","target":"deploy","bypass":true}',
  "::error title=smoke https://school-purchasing-8ggplxxaz-mvorobets-blip.vercel.app::\"/api/health\": supabaseRef=rnawhejsgqhgbtjajjmc, а очікувався rnawhejsgqhgbtjajjmb — NEXT_PUBLIC_SUPABASE_URL у Vercel для цього середовища вказує не на той проєкт Supabase",
  "::error title=smoke https://school-purchasing-8ggplxxaz-mvorobets-blip.vercel.app::другий збій",
].join("\n");

describe("firstError", () => {
  it("стан дрілу 23.11 — перший рядок ::error без «::error title=…::», адреса в title не ламає розбір", () => {
    expect(firstError(DRILL)).toBe(
      '"/api/health": supabaseRef=rnawhejsgqhgbtjajjmc, а очікувався rnawhejsgqhgbtjajjmb — NEXT_PUBLIC_SUPABASE_URL у Vercel для цього середовища вказує не на той проєкт Supabase',
    );
  });

  it("без рядка ::error, з порожнім текстом чи без журналу — null", () => {
    expect(firstError('{"ok":true}\nOK — прод живий')).toBeNull();
    expect(firstError("::error title=smoke x::   \n")).toBeNull();
    expect(firstError("")).toBeNull();
    expect(firstError(undefined)).toBeNull();
  });

  it("::error без title і CRLF — теж читає; довгий текст — в один рядок і до MAX_REASON символів", () => {
    expect(firstError("::error::Немає адреси деплою\r\n")).toBe("Немає адреси деплою");
    const long = firstError(`::error title=smoke https://a.vercel.app::${"x ".repeat(400)}`) ?? "";
    expect(long.length).toBe(MAX_REASON);
    expect(long.endsWith("…")).toBe(true);
    expect(long).not.toContain("\n");
  });
});

describe("redact — значення, схожі на секрети, в Telegram не йдуть", () => {
  it("значення заголовка обходу й довгий ключоподібний рядок — [приховано]; hex коміту й ref Supabase — лишаються", () => {
    const secret = "AbCdEfGhIjKlMnOpQrStUvWxYz012345";
    const sha = "2c5b8eba87076525d294aeb9a0440b2ed811513d";
    const out = firstError(
      `::error title=smoke https://a.vercel.app::x-vercel-protection-bypass: ${secret} key=${secret}9 sha=${sha} ref=rnawhejsgqhgbtjajjmb`,
    );
    expect(out).not.toContain(secret);
    expect(out).toContain("x-vercel-protection-bypass: [приховано]");
    expect(out).toContain(`sha=${sha}`);
    expect(out).toContain("ref=rnawhejsgqhgbtjajjmb");
  });
});

describe("scripts/smoke-first-error.mjs (CLI, як у кроці алерту smoke.yml)", () => {
  const run = (...args: string[]) =>
    spawnSync(process.execPath, [path.join(repoRoot, "scripts", "smoke-first-error.mjs"), ...args], { encoding: "utf8" });

  it("друкує причину з файлу журналу й виходить з 0", () => {
    const file = path.join(mkdtempSync(path.join(tmpdir(), "smoke-log-")), "smoke.log");
    writeFileSync(file, DRILL);
    const { status, stdout } = run(file);
    expect(status).toBe(0);
    expect(stdout).toContain("supabaseRef=rnawhejsgqhgbtjajjmc");
    expect(stdout).not.toContain("другий збій");
  });

  it("немає файлу — нічого не друкує й не падає (алерт скаже «див. прогін»)", () => {
    const { status, stdout } = run("/nonexistent/smoke.log");
    expect(status).toBe(0);
    expect(stdout).toBe("");
  });
});
