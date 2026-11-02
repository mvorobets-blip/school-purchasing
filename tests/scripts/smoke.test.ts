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

async function serve(routes: Routes) {
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
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
  return new Promise<{ code: number | null; out: string }>((resolve) => {
    const child = spawn(process.execPath, [path.join(repoRoot, "scripts", "smoke.mjs"), ...args], {
      env: { ...process.env, PROD_URL: "" },
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
});
