// Дія 4 з postmortem docs/incidents/2026-11-23-staging-supabase-url.md: /api/health при збої бази пише в журнал один
// рядок health.db_down з кодом причини й ref Supabase — без значень змінних, ключів і тексту помилки бази.
// Технічні тести — без AC ID (операційна вимога, не AC PM). Мережі немає: supabase-js підмінено.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const probe = vi.hoisted(() => ({ result: { status: 200, error: null as { code?: string; message?: string } | null }, throws: false }));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        limit: async () => {
          if (probe.throws) throw new Error("boom");
          return probe.result;
        },
      }),
    }),
  }),
}));

const { GET } = await import("@/app/api/health/route");

const KEY = "sb_publishable_test-value-not-real-123";
const STAGING_URL = "https://rnawhejsgqhgbtjajjmb.supabase.co";

let logs: { level: string; line: string }[] = [];

beforeEach(() => {
  logs = [];
  for (const level of ["info", "warn", "error", "log"] as const) {
    vi.spyOn(console, level).mockImplementation((line: unknown) => {
      logs.push({ level, line: String(line) });
    });
  }
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", STAGING_URL);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", KEY);
  vi.stubEnv("VERCEL_ENV", "preview");
  vi.stubEnv("APP_ENV", "staging");
  vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "abc1234def5678");
  probe.result = { status: 200, error: null };
  probe.throws = false;
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("/api/health — рядок журналу health.db_down", () => {
  it("база недоступна (status 0, хибна адреса) — 503 і рівно один рядок error з reason, supabaseRef, env, appEnv, sha", async () => {
    probe.result = { status: 0, error: { message: "fetch failed: getaddrinfo ENOTFOUND secret-ish.example.test" } };
    const response = await GET();
    expect(response.status).toBe(503);
    expect(logs).toHaveLength(1);
    expect(logs[0].level).toBe("error");
    const event = JSON.parse(logs[0].line);
    expect(event).toMatchObject({
      event: "health.db_down",
      reason: "status-0",
      supabaseRef: "rnawhejsgqhgbtjajjmb",
      env: "preview",
      appEnv: "staging",
      sha: "abc1234",
    });
    expect(Object.keys(event).sort()).toEqual(["appEnv", "env", "event", "reason", "sha", "supabaseRef", "ts"]);
    expect(logs[0].line).not.toContain("secret-ish.example.test");
    expect(logs[0].line).not.toContain("ENOTFOUND");
  });

  it("код помилки з пробілом (reason не token) — \"unknown\", а не рядок без причини", async () => {
    probe.result = { status: 503, error: { code: "08 006", message: "odd" } };
    await GET();
    expect(JSON.parse(logs[0].line)).toMatchObject({ event: "health.db_down", reason: "unknown" });
  });

  it("у рядку немає ключа, повної адреси Supabase й тексту помилки бази", async () => {
    probe.result = { status: 401, error: { message: "Invalid API key" } };
    await GET();
    const line = logs.map((l) => l.line).join("\n");
    expect(line).toContain('"reason":"invalid-api-key"');
    expect(line).not.toContain(KEY);
    expect(line).not.toContain(STAGING_URL);
    expect(line).not.toContain("Invalid API key");
  });

  it("адреса Supabase не має вигляду https://<ref>.supabase.co — supabaseRef \"none\"; без APP_ENV поля appEnv немає", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://db.example.test");
    vi.stubEnv("APP_ENV", "");
    probe.throws = true;
    await GET();
    const event = JSON.parse(logs[0].line);
    expect(event).toMatchObject({ event: "health.db_down", reason: "exception", supabaseRef: "none" });
    expect(event).not.toHaveProperty("appEnv");
  });

  it("база відповіла — 200 і жодного рядка журналу (журнал не засмічуємо кожним прогоном smoke)", async () => {
    probe.result = { status: 401, error: { code: "42501", message: "permission denied for table profiles" } };
    const response = await GET();
    expect(response.status).toBe(200);
    expect(logs).toHaveLength(0);
  });
});
