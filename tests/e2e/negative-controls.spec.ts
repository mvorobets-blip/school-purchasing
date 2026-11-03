// НЕГАТИВНІ КОНТРОЛІ (walkthrough-dev WS8, крок 5.4; формат — materials/uat/examples/negative-controls.spec.ts курсу).
// Навмисно хибні очікування на AC-FRM-14 — AC лише читає, тож безпечно на спільному проді. Це не AC-тести: назви
// починаються з NC-, а не з AC ID, тож ac:coverage їх не рахує; у звичайному npm run uat їх немає (проєкт chromium —
// grepInvert @negative-control). Запуск: npm run uat:nc -- --url <прод>.
// Що мають показати:
//   NC-1 — у тесті навмисно інший текст «Тоді» → перевірка падає → FAIL (R1), хоч би що сказав агент;
//   NC-2 — текст «Тоді» у «вимозі» змінено (анотація ac-text), а тест і застосунок — ні → перевірки зелені, агент
//          звіряє кадр із НОВИМ текстом і не погоджується → NEEDS-HUMAN (R3).
import { expect, test } from "@playwright/test";
import { attachRuntimeErrors, given, thenStep, when } from "./support/uat";

test.use({ storageState: "playwright/.auth/requester2.json" });

const CLAUSE = "він бачить повідомлення «Ви ще не подали жодної заявки», а списку заявок немає.";
const NO_REQUESTS = "You have not submitted any requests yet";
const WRONG_MESSAGE = "You have no requests yet";

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
    await given("працівник 3 без жодної поданої заявки", async () => {});
    await when("він відкриває сторінку «Мої заявки»", async () => {
      await page.goto("/requests");
    });
    await thenStep(page, { clause: CLAUSE, visible: [`повідомлення «${NO_REQUESTS}»`, "списку заявок немає"] }, async () => {
      await expect(page.getByTestId("no-requests")).toHaveText(WRONG_MESSAGE, { timeout: 5_000 });
    });
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
    await given("працівник 3 без жодної поданої заявки", async () => {});
    await when("він відкриває сторінку «Мої заявки»", async () => {
      await page.goto("/requests");
    });
    await thenStep(page, { clause: CLAUSE, visible: [`повідомлення «${NO_REQUESTS}»`, "списку заявок немає"] }, async () => {
      await expect(page.getByTestId("no-requests")).toHaveText(NO_REQUESTS);
      await expect(page.getByTestId("my-requests")).toHaveCount(0);
    });
  },
);
