// Обхід захисту Vercel у браузері UAT (preview, staging): браузер секрету не бачить. Перед тестом контекст робить один
// запит на ціль UAT_BASE_URL із заголовком обходу без переходу за редиректом і отримує cookie обходу Vercel; далі
// браузер ходить з cookie, а її він шле лише хосту цілі (CodeRabbit, PR #115: extraHTTPHeaders ішли на всі хости,
// а route.continue переносив заголовок через редирект на інший origin). Логіка й перевірки — primeBypassCookie у
// scripts/uat/target.mjs; дозволені цілі — scripts/lib/bypass-host.mjs. Без секрету, локально й у CI — нічого.
// Усі тести e2e беруть test/expect звідси; окремі контексти — лише через newContext нижче.
import { test as base, type Browser, type BrowserContext, type BrowserContextOptions } from "@playwright/test";
import { primeBypassCookie } from "../../../scripts/uat/target.mjs";

const target = process.env.UAT_BASE_URL?.replace(/\/+$/, "");

/** Дає контексту cookie обходу Vercel для цілі UAT. Без секрету чи на локальній збірці — нічого. */
export async function scopeBypass(context: BrowserContext): Promise<void> {
  if (!target) return;
  await primeBypassCookie(context, target, process.env.VERCEL_AUTOMATION_BYPASS_SECRET);
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
