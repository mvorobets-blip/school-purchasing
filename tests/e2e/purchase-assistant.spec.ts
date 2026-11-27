// UAT зрізу 4 (WS10) на проді: помічник AI пропонує рядок закупівлі (вимога PM ValiaBihun/2026-quitcode-dream-team#71).
// Два AC, як вимагає курс: AC-AI-01 — людина підтверджує перед записом (рядок у формі, закупівлю не подано) і AC-AI-02 —
// відмова. Кожен прогін — по одному справжньому запиту до безкоштовної моделі (ліміт 50 на добу, спільний із PM).
// Записів у базі тест не створює: нічого не подає. Описи й тексти — англійською, дослівно з AC (PM оновила #71
// 2026-11-16). Назву й мету AC-AI-01 перевіряємо правилом PM «містить» «paper» / «print» (#71, «Припущення»),
// кількість і ціну — точно.
// Акаунт — pm-requester@example.test (роль requester, заявник «Primary School»; працівник 1 в AC).
import type { Page } from "@playwright/test";
import { expect, test } from "./support/bypass";
import { attachRuntimeErrors, given, thenStep, when } from "./support/uat";

const REQUESTER = "playwright/.auth/requester.json";
const SUGGEST = "Suggest lines";
const OFF_TOPIC = "I can only help with purchases";
const MODEL_WAIT = 20_000; // помічник чекає модель до 15 с (AC-AI-04), плюс мережа

test.afterEach(async ({ page }) => attachRuntimeErrors(page));

// Вище за типові 800 px: кадр «Тоді» (знімок вікна, не всієї сторінки) має вмістити розділ «Lines» повністю —
// інакше агент-рецензент не може підтвердити «рядків не додано» (прогін UAT 16.11 15:47, NEEDS-HUMAN).
// Поле ціни type="number" показує десятковий роздільник: на macOS Chromium бере його з РЕГІОНУ СИСТЕМИ (en_UA — кома),
// і ні locale Playwright, ні --lang цього не змінюють (перевірено 17.11 без моделі й проду); тому на Mac з українським
// регіоном кадр показує «20,00», а в дереві доступності — «20.00», і агент дістає NEEDS-HUMAN за R4 (UAT 16.11 і 17.11;
// PM: «вада тесту, не продукту»). locale en-US лишаємо: на Linux і в CI він дає «20.00».
test.use({ storageState: REQUESTER, viewport: { width: 1280, height: 1400 }, locale: "en-US" });

// «My requests» рахуємо в ОКРЕМІЙ вкладці того ж входу: основна сторінка лишається на формі, тож кадр «Тоді» показує
// запропонований рядок, а не список заявок (прогін UAT 16.11 15:47: кадр знято після переходу на /requests).
const myRequestsCount = async (page: Page) => {
  const tab = await page.context().newPage();
  try {
    await tab.goto("/requests");
    return await tab.getByTestId("request-row").count();
  } finally {
    await tab.close();
  }
};

async function describeAndSuggest(page: Page, description: string) {
  await page.getByLabel("Purchase description").fill(description);
  await page.getByRole("button", { name: SUGGEST }).click();
  // «Looking for lines…» може ще не з'явитись одразу після кліку — тому перша перевірка результату нижче теж чекає
  // MODEL_WAIT, а не типові 5 с (модель відповідає до 15 с).
  await expect(page.getByTestId("assistant-pending")).toHaveCount(0, { timeout: MODEL_WAIT });
}

test(
  "AC-AI-01: опис «Need 3 packs of A4 paper for printing, 20 dollars each» — один рядок у формі (A4 paper, For printing, 3, 20.00), закупівлю ще не подано",
  { tag: ["@uat", "@live-model"], annotation: { type: "ac", description: "AC-AI-01" } },
  async ({ page }) => {
    let before = 0;
    await given("працівник 1 відкрив форму нової закупівлі", async () => {
      before = await myRequestsCount(page);
      await page.goto("/requests/new");
      await expect(page.getByRole("button", { name: SUGGEST })).toBeVisible();
    });

    await when("він вставляє опис «Need 3 packs of A4 paper for printing, 20 dollars each» і натискає «Suggest lines»", async () => {
      await describeAndSuggest(page, "Need 3 packs of A4 paper for printing, 20 dollars each");
    });

    await thenStep(
      page,
      {
        clause: "він бачить один рядок: назва «A4 paper», мета «For printing», кількість 3, ціна 20.00, а закупівлю ще не подано.",
        visible: [
          "форма «New purchase»: у розділі «Lines» рівно один рядок — Item містить «paper», Purpose містить «print», Quantity 3, Price 20.00 (браузер з українською локаллю може показати «20,00»)",
          "в полі «Purchase description» лишився опис «Need 3 packs of A4 paper for printing, 20 dollars each»",
        ],
        hidden: ["у «My requests» стільки ж заявок, скільки до пропозиції (закупівлю не подано) — рахує тест в окремій вкладці"],
      },
      async () => {
        await expect(page.getByLabel("Item")).toHaveCount(1);
        await expect(page.getByLabel("Item")).toHaveValue(/paper/i, { timeout: MODEL_WAIT });
        await expect(page.getByLabel("Purpose", { exact: true })).toHaveValue(/print/i);
        await expect(page.getByLabel("Quantity")).toHaveValue("3");
        await expect(page.getByLabel("Price")).toHaveValue("20.00");
        // Опис лишився в полі після відповіді (AC-AI-03) — до переходу на «My requests».
        await expect(page.getByLabel("Purchase description")).toHaveValue("Need 3 packs of A4 paper for printing, 20 dollars each");
        expect(await myRequestsCount(page)).toBe(before);
      },
    );
  },
);

test(
  "AC-AI-02: опис «Book me a doctor's appointment for Friday» — «I can only help with purchases», рядків у формі не додано",
  { tag: ["@uat", "@live-model"], annotation: { type: "ac", description: "AC-AI-02" } },
  async ({ page }) => {
    await given("працівник 1 відкрив форму нової закупівлі", async () => {
      await page.goto("/requests/new");
      await expect(page.getByRole("button", { name: SUGGEST })).toBeVisible();
    });

    await when("він вставляє опис «Book me a doctor's appointment for Friday» і натискає «Suggest lines»", async () => {
      await describeAndSuggest(page, "Book me a doctor's appointment for Friday");
    });

    await thenStep(
      page,
      {
        clause: "він бачить повідомлення «I can only help with purchases», а рядків у формі не додано.",
        visible: [
          "повідомлення «I can only help with purchases»",
          "у розділі «Lines» рівно один рядок, і всі його поля (Item, Purpose, Quantity, Price) порожні; нижче — лише «Add line» і «Submit»",
        ],
      },
      async () => {
        await expect(page.getByTestId("assistant-message")).toHaveText(OFF_TOPIC, { timeout: MODEL_WAIT });
        await expect(page.getByLabel("Item")).toHaveCount(1);
        // Усі чотири поля єдиного рядка порожні — «рядків у формі не додано» (зауваження PM: Purpose і Price теж).
        await expect(page.getByLabel("Item")).toHaveValue("");
        await expect(page.getByLabel("Purpose", { exact: true })).toHaveValue("");
        await expect(page.getByLabel("Quantity")).toHaveValue("");
        await expect(page.getByLabel("Price")).toHaveValue("");
      },
    );
  },
);
