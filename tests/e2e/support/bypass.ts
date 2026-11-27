// Обхід захисту Vercel у браузері UAT (preview, staging): заголовок x-vercel-protection-bypass лише запитам на origin
// цілі UAT_BASE_URL — маршрутом контексту (context.route), а не extraHTTPHeaders, які Playwright шле на ВСІ хости
// (CodeRabbit, PR #115). Перелік дозволених цілей — scripts/lib/bypass-host.mjs; без секрету, локально й у CI — нічого.
// Перевірено в Chromium (Playwright 1.64): картинки й fetch на інший origin — без заголовка; редирект з цілі на ІНШИЙ
// origin заголовок зберігає (так працює route.continue). Таких редиректів застосунок не робить: усі його редиректи
// (/ → /login, після входу) — на той самий сайт. З'явиться зовнішній вхід чи редирект — переглянути тут.
// Усі тести e2e беруть test/expect звідси; окремі контексти — лише через newContext нижче.
import { test as base, type Browser, type BrowserContext, type BrowserContextOptions } from "@playwright/test";
import { bypassRoute } from "../../../scripts/uat/target.mjs";

const target = process.env.UAT_BASE_URL?.replace(/\/+$/, "");
const bypass = target ? bypassRoute(target, process.env.VERCEL_AUTOMATION_BYPASS_SECRET) : null;

/** Додає заголовок обходу запитам контексту на origin цілі. Без секрету чи на локальній збірці — нічого. */
export async function scopeBypass(context: BrowserContext): Promise<void> {
  if (!bypass) return;
  await context.route(bypass.matches, (route) =>
    route.continue({ headers: { ...route.request().headers(), ...bypass.headers } }),
  );
}

/** browser.newContext з тим самим обходом, що й контекст тесту. */
export async function newContext(browser: Browser, options?: BrowserContextOptions): Promise<BrowserContext> {
  const context = await browser.newContext(options);
  await scopeBypass(context);
  return context;
}

export const test = base.extend({
  // provide, а не use: інакше react-hooks/rules-of-hooks бачить тут хук React.
  context: async ({ context }, provide) => {
    await scopeBypass(context);
    await provide(context);
  },
});

export { expect } from "@playwright/test";
