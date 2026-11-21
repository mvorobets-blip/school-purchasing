// D0: чи відповіла база на запит /api/health. Чиста функція — щоб перевірити всі гілки тестом без мережі.
// Запит — публічним ключем до таблиці без доступу для anon: «немає прав» (42501) теж означає, що Postgres живий.

/** Код SQLSTATE Postgres, напр. 42501 «permission denied»: запит дійшов до бази. */
const SQLSTATE = /^[0-9A-Z]{5}$/;
/** PostgREST не може під'єднатися до бази: 000–003 і X00 (внутрішня помилка бібліотеки з'єднання). */
const PGRST_DB_DOWN = /^(PGRST00[0-3]|PGRSTX00)$/;
/** Supabase відповідає 540, коли безкоштовний проєкт призупинено (Dashboard → Resume project). */
const SUPABASE_PAUSED = 540;

/** Postgres відповів, але нездоровий: 08 з'єднання, 53 ресурси, 57 втручання оператора, 58 система, XX внутрішня помилка. */
const SQLSTATE_UNHEALTHY = /^(08|53|57|58|XX)/;
/** Схема не та, що чекає запит перевірки: 42P01 немає таблиці, 42703 немає колонки — застосунок теж зламаний. */
const SQLSTATE_SCHEMA_BROKEN = /^(42P01|42703)$/;

export type DbProbe = { status: number; error: { code?: string; message?: string } | null };
export type DbHealth = { db: "ok" | "down"; reason: string };

export function classifyDbProbe({ status, error }: DbProbe): DbHealth {
  if (status === SUPABASE_PAUSED) return { db: "down", reason: "paused" };
  const code = error?.code ?? "";
  const sqlstateAlive = SQLSTATE.test(code) && !SQLSTATE_UNHEALTHY.test(code) && !SQLSTATE_SCHEMA_BROKEN.test(code);
  // Без помилки — лише за 2xx: 5xx з порожнім тілом теж дає error === null.
  const successStatus = status >= 200 && status < 300;
  if ((!error && successStatus) || sqlstateAlive || (code.startsWith("PGRST") && !PGRST_DB_DOWN.test(code))) {
    return { db: "ok", reason: "" };
  }
  if (/api key/i.test(error?.message ?? "")) return { db: "down", reason: "invalid-api-key" };
  // 0 — мережа (Supabase недоступний або хибний URL), 5xx, PGRST000–003.
  return { db: "down", reason: `status-${status}${code ? `-${code}` : ""}` };
}

// WS11: у якому середовищі й з якою базою працює деплой — без секретів. appEnv — лише значення змінної APP_ENV (на гілці
// staging у Vercel = "staging"; на staging VERCEL_ENV теж "preview", тож лише APP_ENV їх розрізняє), без неї — null
// (R03 курсу: так з /api/health видно, де APP_ENV справді задано; VERCEL_ENV і так є в полі env).
// supabaseRef — ref проєкту Supabase з адреси NEXT_PUBLIC_SUPABASE_URL (https://<ref>.supabase.co): не секрет, він і так
// є в публічній адресі; за ним smoke і перевірка курсу бачать, що staging і preview ходять не в прод-базу.
const SUPABASE_HOST = /^([a-z0-9]{20})\.supabase\.co$/;

export function supabaseRefFrom(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return SUPABASE_HOST.exec(new URL(url).hostname)?.[1] ?? null;
  } catch {
    return null;
  }
}

export function appEnvFrom(appEnv: string | undefined): string | null {
  return appEnv?.trim() || null;
}
