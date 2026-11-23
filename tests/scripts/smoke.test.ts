import { spawn } from "node:child_process";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { repoRoot } from "./run-script";

// scripts/smoke.mjs проти локального HTTP-сервера: без мережі й без проду.
type Reply = { status: number; headers?: Record<string, string>; body?: string };
type Routes = Record<string, Reply>;

const LOGIN: Reply = { status: 200, headers: { "content-type": "text/html" }, body: '<input type="password" name="password">' };
const HEALTHY: Reply = { status: 200, body: JSON.stringify({ ok: true, sha: "abc1234", env: "production", db: "ok", reason: "" }) };

let close: (() => void) | undefined;
afterEach(() => close?.());

// Заголовки, які бачив сервер, — щоб перевірити заголовок обходу Vercel.
let seen: IncomingMessage["headers"][] = [];

async function serve(routes: Routes) {
  seen = [];
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    seen.push(req.headers);
    const reply = routes[req.url ?? ""] ?? { status: 404 };
    res.writeHead(reply.status, reply.headers);
    res.end(reply.body ?? "");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  close = () => server.close();
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

// Асинхронний запуск: spawnSync заблокував би сервер у цьому ж процесі.
function smoke(...args: string[]) {
  return smokeWith({}, ...args);
}

function smokeWith(extraEnv: Record<string, string>, ...args: string[]) {
  return new Promise<{ code: number | null; out: string }>((resolve) => {
    const child = spawn(process.execPath, [path.join(repoRoot, "scripts", "smoke.mjs"), ...args], {
      env: { ...process.env, PROD_URL: "", VERCEL_AUTOMATION_BYPASS_SECRET: "", SMOKE_TARGET: "", ...extraEnv },
    });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    child.on("close", (code) => resolve({ code, out }));
  });
}

describe("smoke.mjs", () => {
  it("код 0, коли / веде на /login того самого сайту, вхід відкривається, а база відповідає з очікуваним sha", async () => {
    const base = await serve({ "/": { status: 307, headers: { location: "/login" } }, "/login": LOGIN, "/api/health": HEALTHY });
    const { code, out } = await smoke(base, "abc1234");
    expect(out).toContain("OK — прод живий");
    expect(code).toBe(0);
  });

  it("збій, коли / веде на інший сайт", async () => {
    const base = await serve({
      "/": { status: 302, headers: { location: "https://other.example.test/login" } },
      "/login": LOGIN,
      "/api/health": HEALTHY,
    });
    const { code, out } = await smoke(base);
    expect(out).toContain("редирект не на");
    expect(code).toBe(1);
  });

  it("збій без слова «редирект», коли / віддає 204 без Location", async () => {
    const base = await serve({ "/": { status: 204 }, "/login": LOGIN, "/api/health": HEALTHY });
    const { code, out } = await smoke(base);
    expect(out).toContain('"/": HTTP 204 — очікували 200 або редирект');
    expect(code).toBe(1);
  });

  it("збій, коли / віддає 201 з Location: /login — це не редирект", async () => {
    const base = await serve({ "/": { status: 201, headers: { location: "/login" } }, "/login": LOGIN, "/api/health": HEALTHY });
    const { code, out } = await smoke(base);
    expect(out).toContain('"/": HTTP 201 — очікували 200 або редирект');
    expect(code).toBe(1);
  });

  it("підказує PUBLIC_PATHS, коли /api/health веде на /login", async () => {
    const base = await serve({
      "/": { status: 307, headers: { location: "/login" } },
      "/login": LOGIN,
      "/api/health": { status: 307, headers: { location: "/login" } },
    });
    const { code, out } = await smoke(base);
    expect(out).toContain('додайте "/api/health" у PUBLIC_PATHS');
    expect(code).toBe(1);
  });

  it("збій, коли /api/health віддає 503, навіть із db: ok у тілі", async () => {
    const base = await serve({
      "/": { status: 307, headers: { location: "/login" } },
      "/login": LOGIN,
      "/api/health": { status: 503, body: JSON.stringify({ ok: true, sha: "abc1234", db: "ok", reason: "" }) },
    });
    const { code, out } = await smoke(base);
    expect(out).toContain('"/api/health": HTTP 503, db=ok');
    expect(code).toBe(1);
  });

  it("бере HTTP-статус відповіді, а не поле status з тіла /api/health", async () => {
    const base = await serve({
      "/": { status: 307, headers: { location: "/login" } },
      "/login": LOGIN,
      "/api/health": { status: 503, body: JSON.stringify({ status: 200, ok: false, sha: "abc1234", db: "down", reason: "status-0" }) },
    });
    const { code, out } = await smoke(base);
    expect(out).toContain('"/api/health": HTTP 503, db=down (status-0)');
    expect(code).toBe(1);
  });

  it("показує адресу редиректу /api/health, навіть коли тіло — JSON", async () => {
    const base = await serve({
      "/": { status: 307, headers: { location: "/login" } },
      "/login": LOGIN,
      "/api/health": { status: 307, headers: { location: "/login" }, body: JSON.stringify({ redirect: true }) },
    });
    const { code, out } = await smoke(base);
    expect(out).toContain('"/api/health": 307 → /login — додайте "/api/health" у PUBLIC_PATHS');
    expect(code).toBe(1);
  });

  it("коли вхід не відкрився, усе одно питає /api/health — причина бази видна в лозі", async () => {
    const base = await serve({
      "/": { status: 307, headers: { location: "/login" } },
      "/login": { status: 500 },
      "/api/health": { status: 503, body: JSON.stringify({ ok: false, sha: "abc1234", db: "down", reason: "paused" }) },
    });
    const { code, out } = await smoke(base, "abc1234");
    expect(out).toContain('"/login": HTTP 500');
    expect(out).toContain('"/api/health": Supabase призупинено');
    expect(code).toBe(1);
  });

  const SECRET = "bypass-test-value-not-real-0123456789";
  const OK_ROUTES: Routes = { "/": { status: 307, headers: { location: "/login" } }, "/login": LOGIN, "/api/health": HEALTHY };

  it("із секретом обходу надсилає x-vercel-protection-bypass у кожному запиті й не друкує значення", async () => {
    const base = await serve(OK_ROUTES);
    const { code, out } = await smokeWith({ VERCEL_AUTOMATION_BYPASS_SECRET: SECRET, SMOKE_TARGET: "deploy" }, base, "abc1234");
    expect(seen.length).toBeGreaterThanOrEqual(3);
    expect(seen.every((h) => h["x-vercel-protection-bypass"] === SECRET)).toBe(true);
    expect(seen.some((h) => "x-vercel-set-bypass-cookie" in h)).toBe(false);
    expect(out).not.toContain(SECRET);
    expect(out).toContain('"bypass":true');
    expect(out).toContain("OK — деплой живий");
    expect(code).toBe(0);
  });

  it("без секрету заголовка обходу немає", async () => {
    const base = await serve(OK_ROUTES);
    const { code, out } = await smoke(base);
    expect(seen.some((h) => "x-vercel-protection-bypass" in h)).toBe(false);
    expect(out).toContain('"bypass":false');
    expect(code).toBe(0);
  });

  it("деплой за стіною Vercel без секрету — підказка увімкнути Protection Bypass for Automation", async () => {
    const base = await serve({ "/": { status: 401, body: "Vercel Authentication" }, "/login": { status: 401 }, "/api/health": { status: 401 } });
    const { code, out } = await smokeWith({ SMOKE_TARGET: "deploy" }, base);
    expect(out).toContain("Protection Bypass for Automation");
    expect(code).toBe(1);
  });

  it("Vercel не прийняв секрет — підказка оновити секрет, значення не друкується", async () => {
    const base = await serve({ "/": { status: 401, body: "Vercel Authentication" }, "/login": { status: 401 }, "/api/health": { status: 401 } });
    const { code, out } = await smokeWith({ VERCEL_AUTOMATION_BYPASS_SECRET: SECRET, SMOKE_TARGET: "deploy" }, base);
    expect(out).toContain("Vercel не прийняв секрет обходу");
    expect(out).not.toContain(SECRET);
    expect(code).toBe(1);
  });

  // Дія з postmortem docs/incidents/2026-11-23-staging-supabase-url.md: smoke знає, з якою базою має працювати
  // середовище (змінна репо SUPABASE_STAGING_REF / SUPABASE_PROD_REF → SMOKE_EXPECT_SUPABASE_REF), і хибна адреса
  // Supabase у Vercel дає рядок з назвою змінної, а не загальне «Supabase недоступний?». Refs — не секрети.
  const STAGING = "rnawhejsgqhgbtjajjmb";
  const health = (body: Record<string, unknown>, status = 200): Reply => ({
    status,
    body: JSON.stringify({ ok: status === 200, sha: "abc1234", env: "preview", appEnv: "staging", db: "ok", reason: "", ...body }),
  });
  const withHealth = (reply: Reply): Routes => ({ ...OK_ROUTES, "/api/health": reply });

  it("стан дрілу 23.11: хибний ref у NEXT_PUBLIC_SUPABASE_URL — збій з назвою змінної й обома ref", async () => {
    const base = await serve(withHealth(health({ supabaseRef: "rnawhejsgqhgbtjajjmc", db: "down", reason: "status-0" }, 503)));
    const { code, out } = await smokeWith({ SMOKE_TARGET: "deploy", SMOKE_EXPECT_SUPABASE_REF: STAGING }, base);
    expect(out).toContain('"/api/health": supabaseRef=rnawhejsgqhgbtjajjmc, а очікувався rnawhejsgqhgbtjajjmb');
    expect(out).toContain("NEXT_PUBLIC_SUPABASE_URL у Vercel для цього середовища вказує не на той проєкт Supabase");
    expect(code).toBe(1);
  });

  it("база відповідає, але це інша база (staging дивиться в прод) — теж збій, хоча db=ok", async () => {
    const base = await serve(withHealth(health({ supabaseRef: "tqbvafkcniaspvluverp" })));
    const { code, out } = await smokeWith({ SMOKE_TARGET: "deploy", SMOKE_EXPECT_SUPABASE_REF: STAGING }, base);
    expect(out).toContain("supabaseRef=tqbvafkcniaspvluverp, а очікувався rnawhejsgqhgbtjajjmb");
    expect(out).not.toContain("OK —");
    expect(code).toBe(1);
  });

  it("supabaseRef null — NEXT_PUBLIC_SUPABASE_URL не має вигляду https://<ref>.supabase.co", async () => {
    const base = await serve(withHealth(health({ supabaseRef: null })));
    const { code, out } = await smokeWith({ SMOKE_TARGET: "deploy", SMOKE_EXPECT_SUPABASE_REF: STAGING }, base);
    expect(out).toContain("NEXT_PUBLIC_SUPABASE_URL у Vercel не має вигляду https://<ref>.supabase.co");
    expect(code).toBe(1);
  });

  it("ref збігається з очікуваним — зелений", async () => {
    const base = await serve(withHealth(health({ supabaseRef: STAGING })));
    const { code, out } = await smokeWith({ SMOKE_TARGET: "deploy", SMOKE_EXPECT_SUPABASE_REF: STAGING }, base);
    expect(out).toContain("OK — деплой живий");
    expect(code).toBe(0);
  });

  it("без SMOKE_EXPECT_SUPABASE_REF чи без поля supabaseRef у відповіді ref не порівнюємо", async () => {
    const noExpect = await serve(withHealth(health({ supabaseRef: "rnawhejsgqhgbtjajjmc" })));
    expect((await smoke(noExpect)).code).toBe(0);
    close?.();
    const noField = await serve(OK_ROUTES);
    expect((await smokeWith({ SMOKE_EXPECT_SUPABASE_REF: STAGING }, noField)).code).toBe(0);
  });

  it("на адресу не з *.vercel.app секрет обходу не надсилає", async () => {
    const base = (await serve(OK_ROUTES)).replace("127.0.0.1", "localhost.");
    const { out } = await smokeWith({ VERCEL_AUTOMATION_BYPASS_SECRET: SECRET, SMOKE_TARGET: "deploy" }, base);
    expect(seen.length).toBeGreaterThanOrEqual(3);
    expect(seen.some((h) => "x-vercel-protection-bypass" in h)).toBe(false);
    expect(out).toContain('"bypass":false');
    expect(out).not.toContain(SECRET);
  });
});
