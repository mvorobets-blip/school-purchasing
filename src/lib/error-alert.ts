// Трекер помилок сервера без Sentry (WS11, трек B): src/instrumentation.ts передає сюди кожну необроблену помилку
// сервера (сторінка, маршрут API, Server Action, proxy), а ми шлемо КОРОТКЕ повідомлення в ту саму групу Telegram, що й
// алерт smoke (англійською, як увесь текст у src/ — AC-LANG-01): маршрут, тип, метод, назва помилки, digest, до 5 верхніх рядків стеку, середовище, деплой і коміт.
// Взято з koldovsky/2026-quitcode-11-devops-operations-hw materials/ops-kit/src/instrumentation.ts.example; логіку
// винесено сюди з instrumentation.ts, щоб її довели тести (tests/error-alert.test.ts); змінні й fetch передаються явно.
//
// Що НЕ надсилаємо ніколи: заголовки запиту (там cookie сесії), тіло запиту, рядок запиту (?query, request.path не
// беремо) і error.message (може містити дані користувача). Зі стеку — лише рядки «at …» (функція, файл, рядок).
// Повний стек — у Runtime Logs Vercel за digest чи часом і маршрутом (на Hobby живуть 1 годину).
// Змінні (лише назви): TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID — серверні змінні Vercel (Production і Preview), без
// NEXT_PUBLIC_. Немає змінних — нічого не шлемо, продукт від цього не падає.

const TIMEOUT_MS = 2_500; // не тримаємо відповідь користувачу довше: Telegram недоступний — повідомлення пропадає
export const SAME_ERROR_PAUSE_MS = 60_000; // та сама помилка на тому самому маршруті — не частіше разу на хвилину
const STACK_FRAMES = 5;
const FRAME_MAX = 160;

export type ErrorRequest = Readonly<{ method: string }>;
export type ErrorContext = Readonly<{ routePath: string; routeType: string; routerKind: string }>;
export type AlertEnv = {
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_CHAT_ID?: string;
  APP_ENV?: string;
  VERCEL_ENV?: string;
  VERCEL_GIT_COMMIT_REF?: string;
  VERCEL_GIT_COMMIT_SHA?: string;
  VERCEL_DEPLOYMENT_ID?: string;
};

/**
 * Лише рядки «at …» зі стеку. Заголовок «Назва: текст помилки» відрізаємо цілим (текст може бути багаторядковим і
 * містити дані користувача), беремо лише рядки виду «at … файл:рядок:колонка», а абсолютний шлях скорочуємо до
 * .next/…, src/… чи node_modules/… — щоб у чат не потрапило ім'я користувача ОС з локального шляху.
 */
// Абсолютний шлях у кадрі: до .next/, src/ чи node_modules/ — відносний (як раніше); будь-який інший абсолютний шлях
// (зокрема з пробілами) — лише назва файла з рядком і колонкою: ім'я користувача ОС у чат не йде (CodeRabbit, PR 97).
const KNOWN_ROOT = /(?:[A-Za-z]:)?[\\/][^()]*?[\\/](\.next|src|node_modules)[\\/]/g;
// Абсолютний шлях у кадрі починається одразу після «(» чи пробілу після «at»: так не чіпаємо відносні .next/… і node:internal/….
const OTHER_ABSOLUTE = /(?<=[(\s])(?:[A-Za-z]:)?[\\/][^()]*[\\/]([^\\/()]+:\d+:\d+)/g;

function shortenPath(line: string): string {
  const known = line.replace(KNOWN_ROOT, "$1/");
  return known.replace(OTHER_ABSOLUTE, "$1");
}

export function stackFrames(error: unknown): string[] {
  if (!(error instanceof Error) || typeof error.stack !== "string") return [];
  const header = error.message ? `${error.name}: ${error.message}` : error.name;
  const body = error.stack.startsWith(header)
    ? error.stack.slice(header.length)
    : error.stack.split("\n").slice(header.split("\n").length).join("\n");
  return body
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("at ") && /:\d+:\d+\)?$/.test(line))
    .map(shortenPath)
    .slice(0, STACK_FRAMES)
    .map((line) => line.slice(0, FRAME_MAX));
}

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : typeof error;
}

function errorDigest(error: unknown): string {
  const raw = (error as { digest?: unknown } | null)?.digest;
  return typeof raw === "string" ? raw.slice(0, 40) : "";
}

export function alertText(error: unknown, request: ErrorRequest, context: ErrorContext, env: AlertEnv): string {
  // APP_ENV=staging — змінна лише для гілки staging (як у /api/health).
  const appEnv = env.APP_ENV?.trim() || env.VERCEL_ENV || "local";
  const branch = env.VERCEL_GIT_COMMIT_REF;
  const digest = errorDigest(error);
  const frames = stackFrames(error);
  return [
    "SERVER ERROR",
    `Environment: ${appEnv}${branch ? ` (branch ${branch})` : ""}`,
    `Route: ${request.method} ${context.routePath} (${context.routeType}, ${context.routerKind})`,
    `Error: ${errorName(error)}${digest ? `, digest ${digest}` : ""}`,
    `Deployment: ${env.VERCEL_DEPLOYMENT_ID ?? "?"}, commit ${(env.VERCEL_GIT_COMMIT_SHA ?? "local").slice(0, 7)}`,
    ...(frames.length ? ["Stack (top frames):", ...frames] : []),
  ].join("\n");
}

/** Повертає функцію, що каже «слати» не частіше разу на SAME_ERROR_PAUSE_MS для того самого ключа. */
export function createThrottle(pauseMs = SAME_ERROR_PAUSE_MS) {
  const lastSent = new Map<string, number>();
  return (key: string, now: number): boolean => {
    if (now - (lastSent.get(key) ?? Number.NEGATIVE_INFINITY) < pauseMs) return false;
    lastSent.set(key, now);
    return true;
  };
}

type Deps = { env: AlertEnv; fetch: typeof fetch; now: () => number; shouldSend: (key: string, now: number) => boolean };

export async function reportServerError(error: unknown, request: ErrorRequest, context: ErrorContext, deps: Deps) {
  const { TELEGRAM_BOT_TOKEN: token, TELEGRAM_CHAT_ID: chatId } = deps.env;
  if (!token || !chatId) return;
  if (!deps.shouldSend(`${context.routePath}|${errorDigest(error) || errorName(error)}`, deps.now())) return;

  try {
    await deps.fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: alertText(error, request, context, deps.env) }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    // Навмисно нічого не пишемо: помилка fetch містить адресу запиту, а в ній — токен бота.
  }
}
