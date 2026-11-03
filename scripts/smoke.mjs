#!/usr/bin/env node
// D0 smoke розгорнутого застосунку: лише GET, без входу й форм, без секретів (Node 24, без залежностей).
// Використання: node scripts/smoke.mjs <base-url> [expected-sha]     (або npm run smoke -- <base-url> [sha])
//   1) "/"           → редірект на /login або 200 (не 401/404/5xx і не стіна входу Vercel);
//   2) "/login"      → 200 і поле пароля (застосунок справді віддає сторінку);
//   3) "/api/health" → 200 {db:"ok"}; з expected-sha — sha збігається (до 6 спроб × 20 с: прод-домен перемикається
//                      на новий деплой не миттєво).
// Код виходу: 0 — усе гаразд, 1 — є збій (рядки ::error:: видно в GitHub Actions), 2 — не вказано адресу.
const [rawBase = process.env.PROD_URL ?? "", expectSha = ""] = process.argv.slice(2);
// client_payload.url від Vercel може прийти хостом без схеми — додаємо https://.
const base = (/^https?:\/\//.test(rawBase) ? rawBase : rawBase ? `https://${rawBase}` : "").replace(/\/+$/, "");

const TIMEOUT_MS = 20_000;

const get = async (path) => {
  try {
    // 20 с на запит: інакше завислий запит з'їсть timeout-minutes job-а до рядків ::error::.
    const r = await fetch(base + path, {
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { "user-agent": "smoke/1.0 (D0)" },
    });
    return {
      status: r.status,
      location: r.headers.get("location") ?? "",
      vercelError: r.headers.get("x-vercel-error") ?? "",
      text: await r.text(),
    };
  } catch (e) {
    return { status: 0, location: "", vercelError: "", text: String(e.cause?.code ?? e) };
  }
};
// Справжні редиректи: Location з іншим статусом (напр. 201) — не редирект.
const REDIRECT_STATUSES = [301, 302, 303, 307, 308];
// Без входу застосунок з "/" веде на /login того самого сайту (src/lib/supabase/proxy.ts); інший редирект — збій.
const isSameSiteLogin = (location) => {
  try {
    const target = new URL(location, base);
    return target.origin === new URL(base).origin && target.pathname === "/login";
  } catch {
    return false;
  }
};
const vercelWall = (r) =>
  /vercel\.com\/(sso|login)|_vercel_sso/.test(r.location) || ((r.status === 401 || r.status === 403) && /vercel/i.test(r.text));

// Кожна перевірка повертає текст збою або null.
function rootProblem(root) {
  if (vercelWall(root)) return `"/": стіна входу Vercel — Settings → Deployment Protection → вимкніть Vercel Authentication`;
  if (root.status === 0) return `"/": недоступний (${root.text})`;
  if (root.status >= 400) {
    const hint = root.vercelError === "MIDDLEWARE_INVOCATION_FAILED" ? " — у Vercel бракує NEXT_PUBLIC_SUPABASE_*?" : "";
    return `"/": HTTP ${root.status} ${root.vercelError}${hint}`.trim();
  }
  if (root.status === 200) return null;
  if (!REDIRECT_STATUSES.includes(root.status) || !root.location) {
    return `"/": HTTP ${root.status} — очікували 200 або редирект на ${base}/login`;
  }
  return isSameSiteLogin(root.location) ? null : `"/": HTTP ${root.status}, редирект не на ${base}/login (${root.location})`;
}

function loginProblem(login) {
  if (login.status === 200 && /type=["']?password/i.test(login.text)) return null;
  return `"/login": HTTP ${login.status} ${login.vercelError}${login.status === 200 ? " (немає поля пароля)" : ""}`.trim();
}

// Статус — завжди HTTP-відповіді, а не поле тіла; не-об'єкт у тілі не розгортаємо.
function parseHealth(r) {
  try {
    const body = JSON.parse(r.text);
    return { ...(body && typeof body === "object" && !Array.isArray(body) ? body : {}), status: r.status, ...(r.location ? { location: r.location } : {}) };
  } catch {
    return { status: r.status, location: r.location };
  }
}

// З expected-sha — до 6 спроб × 20 с, доки прод-домен не перемкнеться на новий деплой; якщо вхід не відкрився —
// один запит лише для діагностики (reason, db, sha у лозі), без очікування.
async function fetchHealth(canRetry) {
  let health = null;
  const attempts = expectSha && canRetry ? 6 : 1;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    health = parseHealth(await get("/api/health"));
    // sha=local — Vercel не віддає VERCEL_GIT_COMMIT_SHA: чекати марно.
    if (!expectSha || health.sha === expectSha || health.sha === "local") break;
    if (attempt < attempts) await new Promise((res) => setTimeout(res, 20_000));
  }
  return health;
}

function healthProblem(health) {
  if (health.status === 404) return `"/api/health": 404 — додайте src/app/api/health/route.ts`;
  if (health.status >= 300 && health.status < 400) {
    return `"/api/health": ${health.status} → ${health.location} — додайте "/api/health" у PUBLIC_PATHS (src/lib/supabase/proxy.ts)`;
  }
  if (health.reason === "paused") {
    return `"/api/health": Supabase призупинено — Dashboard → Resume project (безкоштовний проєкт засинає після тижня без активності)`;
  }
  if (health.reason === "invalid-api-key") {
    return `"/api/health": ключ NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY у Vercel не приймається — звірте змінні Production і зробіть Redeploy`;
  }
  if (health.status === 200 && health.db === "ok") return null;
  const reason = health.reason ? ` (${health.reason})` : "";
  return `"/api/health": HTTP ${health.status}, db=${health.db ?? "?"}${reason} — Supabase недоступний чи NEXT_PUBLIC_SUPABASE_URL у Vercel не той?`;
}

function shaProblem(health) {
  if (!expectSha || !health?.sha) return null;
  if (health.sha === "local") {
    return `"/api/health": sha=local — у Vercel увімкніть Settings → Environment Variables → «Automatically expose System Environment Variables» і зробіть Redeploy`;
  }
  if (health.sha === expectSha) return null;
  return `прод показує ${String(health.sha).slice(0, 7)}, а очікувався ${expectSha.slice(0, 7)} — деплой main не пройшов чи зроблено Instant Rollback?`;
}

async function main() {
  const root = await get("/");
  const login = await get("/login");
  const health = await fetchHealth(login.status === 200);
  const fail = [rootProblem(root), loginProblem(login), healthProblem(health), shaProblem(health)].filter(Boolean);

  console.log(JSON.stringify({ base, root: root.status, login: login.status, health }));
  for (const f of fail) console.log(`::error title=smoke ${base}::${f}`);
  if (!fail.length) console.log("OK — прод живий, сторінка входу відкривається, база відповідає.");
  return fail.length ? 1 : 0;
}

// process.exitCode, а не process.exit(): на Windows exit() після fetch падає з assertion libuv.
if (!base) {
  console.error("Використання: node scripts/smoke.mjs <base-url> [expected-sha]  (або змінна PROD_URL)");
  process.exitCode = 2;
} else {
  process.exitCode = await main();
}
