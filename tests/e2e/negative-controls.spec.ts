// НЕГАТИВНІ КОНТРОЛІ (walkthrough-dev WS8, крок 5.4; формат — materials/uat/examples/negative-controls.spec.ts курсу).
// Навмисно хибні очікування на AC-FRM-14 — AC лише читає, тож безпечно на спільному проді. Це не AC-тести: назви
// починаються з NC-, а не з AC ID, тож ac:coverage їх не рахує; у звичайному npm run uat їх немає (проєкт chromium —
// grepInvert @negative-control). Запуск: npm run uat:nc -- --url <прод>.
// Що мають показати:
//   NC-1 — у тесті навмисно інший текст «Тоді» → перевірка падає → FAIL (R1), хоч би що сказав агент;
//   NC-2 — текст «Тоді» у «вимозі» змінено (анотація ac-text), а тест і застосунок — ні → перевірки зелені, агент
//          звіряє кадр із НОВИМ текстом і не погоджується → NEEDS-HUMAN (R3);
//   NC-3 — зріз 3 (WS9): AC-DEC-06 з навмисно іншим текстом відмови → перевірка падає → FAIL (R1). Пише синтетичну
//          заявку uat-…-nc3 (прибирає cleanup.teardown.ts), тож потрібен SUPABASE_SECRET_KEY, як для @writes.
import { expect, test, type Page } from "@playwright/test";
import { createAuthor, requestStatus, submitAs } from "./support/admin";
import { attachRuntimeErrors, given, thenStep, when } from "./support/uat";

test.use({ storageState: "playwright/.auth/requester2.json" });

const CLAUSE = "він бачить повідомлення «Ви ще не подали жодної заявки», а списку заявок немає.";
const NO_REQUESTS = "You have not submitted any requests yet";
const WRONG_MESSAGE = "You have no requests yet";

// Те саме, що в AC-FRM-14 (tests/e2e/purchase.spec.ts): «Дано» перевіряє тест, «списку немає» — у hidden. NC від
// справжнього тесту відрізняються рівно одним навмисним місцем (NC-1 — текст у твердженні, NC-2 — ac-text).
const HIDDEN = ["списку заявок немає: жодного рядка заявки (data-testid=\"request-row\") і таблиці «my-requests»"];
const givenNoRequests = (page: Page) =>
  given("працівник 3 без жодної поданої заявки", async () => {
    await page.goto("/");
    await expect(page.getByRole("main").getByTestId("no-requests")).toHaveText(NO_REQUESTS);
  });

test.afterEach(async ({ page }) => attachRuntimeErrors(page));

test(
  "NC-1 (AC-FRM-14, навмисно хибне очікування в тесті: інший текст порожнього стану)",
  {
    tag: ["@negative-control"],
    annotation: [
      { type: "ac", description: "AC-FRM-14" },
      { type: "case", description: "NC-1" },
    ],
  },
  async ({ page }) => {
    await givenNoRequests(page);
    await when("він відкриває сторінку «Мої заявки»", async () => {
      await page.goto("/requests");
    });
    await thenStep(
      page,
      { clause: CLAUSE, visible: ["заголовок «My requests»", `повідомлення «${NO_REQUESTS}»`], hidden: HIDDEN },
      async () => {
        await expect(page.getByTestId("no-requests")).toHaveText(WRONG_MESSAGE, { timeout: 5_000 });
      },
    );
  },
);

test(
  "NC-2 (AC-FRM-14, текст «Тоді» у вимозі змінено, тест і застосунок — ні)",
  {
    tag: ["@negative-control"],
    annotation: [
      { type: "ac", description: "AC-FRM-14" },
      { type: "case", description: "NC-2" },
      {
        type: "ac-text",
        description:
          "AC-FRM-14: Дано працівник 3 без жодної поданої заявки. Коли він відкриває сторінку «Мої заявки». Тоді він бачить повідомлення «You have no requests yet» і кнопку «Create your first request», а списку заявок немає.",
      },
    ],
  },
  async ({ page }) => {
    await givenNoRequests(page);
    await when("він відкриває сторінку «Мої заявки»", async () => {
      await page.goto("/requests");
    });
    await thenStep(
      page,
      {
        clause: CLAUSE,
        visible: ["заголовок «My requests»", `повідомлення «${NO_REQUESTS}»`, "кнопку «Create your first request»"],
        hidden: HIDDEN,
      },
      async () => {
        await expect(page.getByTestId("no-requests")).toHaveText(NO_REQUESTS);
        await expect(page.getByTestId("my-requests")).toHaveCount(0);
      },
    );
  },
);

test.describe("зріз 3", () => {
  test.use({ storageState: "playwright/.auth/maria.json" });

  test(
    "NC-3 (AC-DEC-06, навмисно хибне очікування в тесті: інший текст відмови)",
    {
      tag: ["@negative-control", "@writes"],
      annotation: [
        { type: "ac", description: "AC-DEC-06" },
        { type: "case", description: "NC-3" },
      ],
    },
    async ({ page }) => {
      let id = "";
      // Те саме, що AC-DEC-06 у tests/e2e/purchase-history.spec.ts, крім одного місця — тексту в твердженні.
      await given("заявка відділу «Початкова школа» зі статусом «Очікує схвалення», Марія схвалює цей відділ", async () => {
        const lines = [{ name: "Папір А4", purpose: "Друк", quantity: "3", price: "20.00" }];
        id = await submitAs(await createAuthor("Primary School", "nc3"), "Primary School", lines);
        expect(await requestStatus(id)).toBe("pending");
      });
      await when("Марія повертає заявку на доопрацювання без причини", async () => {
        await page.goto(`/requests/${id}`);
        await page.getByRole("button", { name: /^Return for revision:/ }).click();
        await page.getByRole("dialog").getByRole("button", { name: "Return for revision" }).click();
      });
      await thenStep(
        page,
        {
          clause: "вона бачить повідомлення «Вкажіть причину», а статус заявки лишається «Очікує схвалення».",
          visible: ["повідомлення «Provide a reason» у діалозі повернення"],
          hidden: ["статус заявки в базі лишається pending"],
        },
        async () => {
          await expect(page.getByRole("dialog").getByRole("alert")).toHaveText("Enter the reason", { timeout: 5_000 });
        },
      );
    },
  );
});
