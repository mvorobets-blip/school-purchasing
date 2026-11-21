// Запобіжник UAT на розгорнутій адресі (WS11, R03): UAT пише в базу з ключами з .env.local (синтетичні користувачі,
// заявки). Перед першим записом звіряємо ref проєкту Supabase з /api/health цільової адреси з ref з
// NEXT_PUBLIC_SUPABASE_URL у .env.local — інакше UAT на staging з прод-ключами в .env.local писав би в прод (і навпаки).
// Захищена Vercel адреса (preview, staging) — заголовок x-vercel-protection-bypass зі змінної
// VERCEL_AUTOMATION_BYPASS_SECRET, лише коли вона задана, і лише на *.vercel.app (секрет не віддаємо чужому хосту).
// Значення секрету й ключів не друкуємо ніде: у повідомленнях — лише ref (він і так у публічній адресі бази).
// Джерело: R03 курсу WS11 і документація Vercel «Protection Bypass for Automation» (приклад Playwright), 17.11.2026.

const SUPABASE_HOST = /^([a-z0-9]{20})\.supabase\.co$/;

/** ref проєкту з https://<ref>.supabase.co або null. */
export function refFromSupabaseUrl(url) {
  if (!url) return null;
  try {
    return SUPABASE_HOST.exec(new URL(url).hostname)?.[1] ?? null;
  } catch {
    return null;
  }
}

/** Чи можна цьому хосту віддати секрет обходу: лише деплої Vercel. */
export function isVercelHost(base) {
  try {
    return new URL(base).hostname.endsWith(".vercel.app");
  } catch {
    return false;
  }
}

/**
 * Заголовки для запитів UAT до розгорнутої адреси. x-vercel-set-bypass-cookie=true — як у прикладі Playwright Vercel:
 * браузер отримує cookie обходу і далі ходить сторінками без стіни входу Vercel.
 * @param {string} base
 * @param {string | undefined} secret
 * @returns {Record<string, string>}
 */
export function bypassHeaders(base, secret) {
  const value = (secret ?? "").trim();
  if (!value || !isVercelHost(base)) return {};
  return { "x-vercel-protection-bypass": value, "x-vercel-set-bypass-cookie": "true" };
}

/** Текст причини зупинки або null, якщо ref збігаються. */
export function targetProblem({ base, healthStatus, healthRef, localRef }) {
  if (!localRef) {
    return "у .env.local немає NEXT_PUBLIC_SUPABASE_URL виду https://<ref>.supabase.co — не знаю, в яку базу піде запис";
  }
  if (healthStatus !== 200) {
    const wall = healthStatus === 401 || healthStatus === 403 || (healthStatus >= 300 && healthStatus < 400);
    return wall
      ? `${base}/api/health відповів ${healthStatus} — адреса за захистом Vercel? Задайте VERCEL_AUTOMATION_BYPASS_SECRET (лише для *.vercel.app)`
      : `${base}/api/health відповів ${healthStatus || "помилкою мережі"} — не можу перевірити базу цілі`;
  }
  if (!healthRef) return `${base}/api/health не віддає supabaseRef — цей деплой ще без WS11 (/api/health з supabaseRef)`;
  if (healthRef !== localRef) {
    return `ціль ${base} працює з базою ${healthRef}, а .env.local — з ${localRef}. Зупинено до запису: підставте ключі тієї самої бази (staging ↔ staging, прод ↔ прод)`;
  }
  return null;
}

/** Запит /api/health цілі з заголовком обходу; повертає статус і supabaseRef (або null). */
export async function fetchTargetHealth(base, secret, fetchImpl = fetch) {
  try {
    const res = await fetchImpl(`${base}/api/health`, {
      redirect: "manual",
      headers: bypassHeaders(base, secret),
      signal: AbortSignal.timeout(20_000),
    });
    let body = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    return { status: res.status, supabaseRef: body?.supabaseRef ?? null, sha: body?.sha ?? null };
  } catch {
    return { status: 0, supabaseRef: null, sha: null };
  }
}

/**
 * Повна перевірка цілі: кидає Error з причиною, якщо писати в базу небезпечно.
 * @param {string} base
 * @param {{ NEXT_PUBLIC_SUPABASE_URL?: string; VERCEL_AUTOMATION_BYPASS_SECRET?: string }} [env]
 * @param {typeof fetch} [fetchImpl]
 */
export async function assertSameDatabase(base, env = process.env, fetchImpl = fetch) {
  const health = await fetchTargetHealth(base, env.VERCEL_AUTOMATION_BYPASS_SECRET, fetchImpl);
  const problem = targetProblem({
    base,
    healthStatus: health.status,
    healthRef: health.supabaseRef,
    localRef: refFromSupabaseUrl(env.NEXT_PUBLIC_SUPABASE_URL),
  });
  if (problem) throw new Error(`UAT зупинено: ${problem}`);
  return health.supabaseRef;
}
