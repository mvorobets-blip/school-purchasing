#!/usr/bin/env node
// D0 smoke розгорнутого застосунку: лише GET, без входу й форм, без секретів (Node 24, без залежностей).
// Використання: node scripts/smoke.mjs <base-url> [expected-sha]     (або npm run smoke -- <base-url> [sha])
//   1) "/"           → редірект на /login або 200 (не 401/404/5xx і не стіна входу Vercel);
//   2) "/login"      → 200 і поле пароля (застосунок справді віддає сторінку);
//   3) "/api/health" → 200 {db:"ok"}; з expected-sha — sha збігається (до 6 спроб × 20 с: прод-домен перемикається
//                      на новий деплой не миттєво).
// Код виходу: 0 — усе гаразд, 1 — є збій (рядки ::error:: видно в GitHub Actions), 2 — не вказано адресу.
// WS11 (smoke v2, взято з koldovsky/2026-quitcode-11-devops-operations-hw materials/ops-kit/scripts/smoke.mjs):
//   - VERCEL_AUTOMATION_BYPASS_SECRET задано → кожен запит несе заголовок x-vercel-protection-bypass (preview і staging
//     за Vercel Authentication). Значення не друкуємо: у журналі лише bypass=true/false.
//   - x-vercel-set-bypass-cookie НЕ надсилаємо: відповідь — редирект із Set-Cookie, а redirect:"manual" побачив би 3xx.
//   - Секрет іде лише на *.vercel.app (і localhost для тестів): на чужу адресу з ручного запуску — без заголовка.
//   - SMOKE_TARGET=deploy (preview і staging у smoke.yml) змінює лише підказки й підсумковий рядок.
//   - SMOKE_EXPECT_SUPABASE_REF задано → supabaseRef з /api/health має збігатися з ним (дія з postmortem
//     docs/incidents/2026-11-23-staging-supabase-url.md): хибна адреса Supabase у Vercel дає рядок з назвою змінної,
//     а staging, що дивиться в чужу базу, червоніє навіть з db=ok. Ref — не секрет (він у публічній адресі).
const [rawBase = process.env.PROD_URL ?? "", expectSha = ""] = process.argv.slice(2);
// client_payload.url від Vercel може прийти хостом без схеми — додаємо https://.
const base = (/^https?:\/\//.test(rawBase) ? rawBase : rawBase ? `https://${rawBase}` : "").replace(/\/+$/, "");

const bypass = (process.env.VERCEL_AUTOMATION_BYPASS_SECRET ?? "").trim();
const target = process.env.SMOKE_TARGET === "deploy" ? "deploy" : "prod";
// Секрет обходу — лише деплоям Vercel (і локальним тестам): ручний запуск приймає будь-яку адресу, чужому хосту
// секрет не віддаємо.
const bypassHost = (() => {
  try {
    const { hostname } = new URL(base);
    return hostname.endsWith(".vercel.app") || hostname === "localhost" || hostname === "127.0.0.1";
  } catch {
    return false;
  }
})();
const headers = { "user-agent": "smoke/2.0 (WS11)" };
const sendBypass = Boolean(bypass) && bypassHost;
if (sendBypass) headers["x-vercel-protection-bypass"] = bypass;

const expectRef = (process.env.SMOKE_EXPECT_SUPABASE_REF ?? "").trim();

const TIMEOUT_MS = 20_000;

const get = async (path) => {
  try {
    // 20 с на запит: інакше завислий запит з'їсть timeout-minutes job-а до рядків ::error::.
    const r = await fetch(base + path, {
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers,
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

// Підказка про стіну входу Vercel залежить від цілі й від того, чи є секрет обходу.
function wallHint() {
  if (bypass && !bypassHost) {
    return `адреса не на *.vercel.app — секрет обходу на неї не надсилаємо; перевірте адресу деплою`;
  }
  if (sendBypass) {
    return "Vercel не прийняв секрет обходу — його перегенерували чи видалили? Скопіюйте актуальний з Vercel (Settings → Deployment Protection → Protection Bypass for Automation) у GitHub Secrets VERCEL_AUTOMATION_BYPASS_SECRET і зробіть Redeploy";
  }
  if (target === "deploy") {
    return "деплой за захистом Vercel, а секрету обходу немає — увімкніть Protection Bypass for Automation (Vercel → Settings → Deployment Protection) і додайте значення в GitHub Secrets як VERCEL_AUTOMATION_BYPASS_SECRET";
  }
  return "прод за стіною входу Vercel — Settings → Deployment Protection: Standard Protection (захищає preview і staging, прод відкритий), не All Deployments";
}

// Кожна перевірка повертає текст збою або null.
function rootProblem(root) {
  if (vercelWall(root)) return `"/": ${wallHint()}`;
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
    return `"/api/health": ключ NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY у Vercel не приймається — звірте змінні цього середовища (Production чи Preview) і зробіть Redeploy`;
  }
  if (health.status === 200 && health.db === "ok") return null;
  const reason = health.reason ? ` (${health.reason})` : "";
  return `"/api/health": HTTP ${health.status}, db=${health.db ?? "?"}${reason} — Supabase недоступний чи NEXT_PUBLIC_SUPABASE_URL у Vercel не той?`;
}

// Лише коли відповідь має поле supabaseRef (старі деплої й чужі адреси його не мають — там порівнювати нічого).
function refProblem(health) {
  if (!expectRef || !health || !("supabaseRef" in health)) return null;
  if (health.supabaseRef === expectRef) return null;
  if (!health.supabaseRef) {
    return `"/api/health": немає supabaseRef — NEXT_PUBLIC_SUPABASE_URL у Vercel не має вигляду https://<ref>.supabase.co (очікувався ref ${expectRef})`;
  }
  return `"/api/health": supabaseRef=${health.supabaseRef}, а очікувався ${expectRef} — NEXT_PUBLIC_SUPABASE_URL у Vercel для цього середовища вказує не на той проєкт Supabase: звірте змінну (Production чи Preview / гілка) і зробіть Redeploy`;
}

function shaProblem(health) {
  if (!expectSha || !health?.sha) return null;
  if (health.sha === "local") {
    return `"/api/health": sha=local — у Vercel увімкніть Settings → Environment Variables → «Automatically expose System Environment Variables» і зробіть Redeploy`;
  }
  if (health.sha === expectSha) return null;
  const why = target === "deploy" ? "адреса деплою показує інший коміт — чи та адреса в client_payload.url?" : "деплой main не пройшов чи зроблено Instant Rollback?";
  const who = target === "deploy" ? base : "прод";
  return `${who} показує ${String(health.sha).slice(0, 7)}, а очікувався ${expectSha.slice(0, 7)} — ${why}`;
}

async function main() {
  const root = await get("/");
  const login = await get("/login");
  const health = await fetchHealth(login.status === 200);
  const fail = [rootProblem(root), loginProblem(login), refProblem(health), healthProblem(health), shaProblem(health)].filter(Boolean);

  // Лише статуси й публічна відповідь /api/health. Секрет обходу — тільки як true/false.
  console.log(JSON.stringify({ base, target, bypass: sendBypass, root: root.status, login: login.status, health }));
  for (const f of fail) console.log(`::error title=smoke ${base}::${f}`);
  if (!fail.length) console.log(`OK — ${target === "deploy" ? "деплой" : "прод"} живий, сторінка входу відкривається, база відповідає.`);
  return fail.length ? 1 : 0;
}

// process.exitCode, а не process.exit(): на Windows exit() після fetch падає з assertion libuv.
if (!base) {
  console.error("Використання: node scripts/smoke.mjs <base-url> [expected-sha]  (або змінна PROD_URL)");
  process.exitCode = 2;
} else {
  process.exitCode = await main();
}
