// UAT зрізу 4 (WS10) на проді: помічник AI пропонує рядок закупівлі (вимога PM ValiaBihun/2026-quitcode-dream-team#71).
// Два AC, як вимагає курс: AC-AI-01 — людина підтверджує перед записом (рядок у формі, закупівлю не подано) і AC-AI-02 —
// відмова. Кожен прогін — по одному справжньому запиту до безкоштовної моделі (ліміт 50 на добу, спільний із PM).
// Записів у базі тест не створює: нічого не подає. Інтерфейс англійською за таблицею #49 (тексти помічника додано PM
// 2026-11-16): «Запропонувати рядки» → «Suggest lines», «Я допомагаю лише із закупівлями» → «I can only help with
// purchases». Назву й мету AC-AI-01 перевіряємо правилом PM «містить» (відповідь на #80), кількість і ціну — точно.
// Акаунт — pm-requester@example.test (роль requester, заявник «Primary School»; працівник 1 в AC).
import { expect, test, type Page } from "@playwright/test";
import { attachRuntimeErrors, given, thenStep, when } from "./support/uat";

const REQUESTER = "playwright/.auth/requester.json";
const SUGGEST = "Suggest lines";
const OFF_TOPIC = "I can only help with purchases";
const MODEL_WAIT = 20_000; // помічник чекає модель до 15 с (AC-AI-04), плюс мережа

test.afterEach(async ({ page }) => attachRuntimeErrors(page));

test.use({ storageState: REQUESTER });

const myRequestsCount = async (page: Page) => {
  await page.goto("/requests");
  return page.getByTestId("request-row").count();
};

async function describeAndSuggest(page: Page, description: string) {
  await page.getByLabel("Purchase description").fill(description);
  await page.getByRole("button", { name: SUGGEST }).click();
  // «Looking for lines…» може ще не з'явитись одразу після кліку — тому перша перевірка результату нижче теж чекає
  // MODEL_WAIT, а не типові 5 с (модель відповідає до 15 с).
  await expect(page.getByTestId("assistant-pending")).toHaveCount(0, { timeout: MODEL_WAIT });
}

test(
  "AC-AI-01: опис «Треба 3 пачки паперу А4 для друку, по 20 доларів» — один рядок у формі (папір, друк, 3, 20.00), закупівлю ще не подано",
  { tag: ["@uat", "@live-model"], annotation: { type: "ac", description: "AC-AI-01" } },
  async ({ page }) => {
    let before = 0;
    await given("працівник 1 відкрив форму нової закупівлі", async () => {
      before = await myRequestsCount(page);
      await page.goto("/requests/new");
      await expect(page.getByRole("button", { name: SUGGEST })).toBeVisible();
    });

    await when("він вставляє опис «Треба 3 пачки паперу А4 для друку, по 20 доларів» і натискає «Запропонувати рядки»", async () => {
      await describeAndSuggest(page, "Треба 3 пачки паперу А4 для друку, по 20 доларів");
    });

    await thenStep(
      page,
      {
        clause: "він бачить один рядок: назва «Папір А4», мета «Для друку», кількість 3, ціна 20.00, а закупівлю ще не подано.",
        visible: ["у формі один рядок: назва містить «Папір», мета містить «друк», кількість 3, ціна 20.00"],
        hidden: ["у «My requests» стільки ж заявок, скільки до пропозиції (закупівлю не подано)"],
      },
      async () => {
        await expect(page.getByLabel("Item")).toHaveCount(1);
        await expect(page.getByLabel("Item")).toHaveValue(/папір/i, { timeout: MODEL_WAIT });
        await expect(page.getByLabel("Purpose", { exact: true })).toHaveValue(/друк/i);
        await expect(page.getByLabel("Quantity")).toHaveValue("3");
        await expect(page.getByLabel("Price")).toHaveValue("20.00");
        // Опис лишився в полі після відповіді (AC-AI-03) — до переходу на «My requests».
        await expect(page.getByLabel("Purchase description")).toHaveValue("Треба 3 пачки паперу А4 для друку, по 20 доларів");
        expect(await myRequestsCount(page)).toBe(before);
      },
    );
  },
);

test(
  "AC-AI-02: опис «Запиши мене до лікаря на п'ятницю» — «I can only help with purchases», рядків у формі не додано",
  { tag: ["@uat", "@live-model"], annotation: { type: "ac", description: "AC-AI-02" } },
  async ({ page }) => {
    await given("працівник 1 відкрив форму нової закупівлі", async () => {
      await page.goto("/requests/new");
      await expect(page.getByRole("button", { name: SUGGEST })).toBeVisible();
    });

    await when("він вставляє опис «Запиши мене до лікаря на п'ятницю» і натискає «Запропонувати рядки»", async () => {
      await describeAndSuggest(page, "Запиши мене до лікаря на п'ятницю");
    });

    await thenStep(
      page,
      {
        clause: "він бачить повідомлення «Я допомагаю лише із закупівлями», а рядків у формі не додано.",
        visible: ["повідомлення «I can only help with purchases»", "у формі лише порожній рядок"],
      },
      async () => {
        await expect(page.getByTestId("assistant-message")).toHaveText(OFF_TOPIC, { timeout: MODEL_WAIT });
        await expect(page.getByLabel("Item")).toHaveCount(1);
        await expect(page.getByLabel("Item")).toHaveValue("");
        await expect(page.getByLabel("Quantity")).toHaveValue("");
      },
    );
  },
);
