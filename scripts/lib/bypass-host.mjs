// Кому можна віддати секрет обходу Vercel (VERCEL_AUTOMATION_BYPASS_SECRET): лише деплоям цього проєкту по https і,
// для scripts/smoke.mjs, локальним тестам. Будь-який *.vercel.app — не наш: секрет пішов би чужому застосунку з ручного
// запуску smoke чи UAT (відгук викладача WS11, koldovsky/2026-quitcode-11-devops-operations-hw#4, пункт 3).
//   - preview і staging: school-purchasing-<хеш або git-гілка>-mvorobets-blip.vercel.app;
//   - прод: therapy-scheduling-ten.vercel.app (той самий проєкт Vercel, прод-домен);
//   - лише https: по http заголовок пішов би відкритим текстом ще до редиректу Vercel на https.
// Залишковий ризик (свідомо): `[a-z0-9-]+` пропускає й чужий проєкт Vercel з назвою на кшталт
// school-purchasing-x-…-mvorobets-blip. Ручний запуск smoke і UAT — лише в людей із правом запису в репо.
const DEPLOY_HOST = /^school-purchasing-[a-z0-9-]+-mvorobets-blip\.vercel\.app$/;
const PROD_HOST = "therapy-scheduling-ten.vercel.app";
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1"]);

function parse(base) {
  try {
    return new URL(base);
  } catch {
    return null;
  }
}

/** true — https-адреса деплою цього проєкту Vercel (preview, staging, прод). Нерозбірна адреса → false. */
export function isProjectDeployHost(base) {
  const url = parse(base);
  if (!url || url.protocol !== "https:") return false;
  return url.hostname === PROD_HOST || DEPLOY_HOST.test(url.hostname);
}

/** Для scripts/smoke.mjs: деплой цього проєкту або локальний тест (localhost, 127.0.0.1 — для tests/scripts). */
export function isBypassHost(base) {
  return isProjectDeployHost(base) || LOCAL_HOSTS.has(parse(base)?.hostname ?? "");
}
