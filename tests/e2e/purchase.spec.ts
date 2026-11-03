// UAT за 3 AC WS8 (вимога PM ValiaBihun/2026-quitcode-dream-team#47) на проді. Лише читання: жоден тест нічого не подає.
// «Тоді» в clause — дослівно з #47. Інтерфейс англійською за вимогою #49 (AC-LANG-03 і таблиця текстів PM), тож
// твердження перевіряють дослівний переклад PM з цієї таблиці: «Недостатньо прав» → «Not enough permissions»,
// «Ви ще не подали жодної заявки» → «You have not submitted any requests yet», «Заповніть усі поля рядка» →
// «Fill in all line fields», «Очікує схвалення» → «Awaiting approval».
// Акаунти (auth.setup.ts): requester — працівник 1, pm-requester@example.test; requester2 — працівник 2/3,
// member2@example.test (той самий відділ «Primary School», не автор, не схвалювач, без поданих заявок).
import { expect, test, type Browser, type Page } from "@playwright/test";
import { attachRuntimeErrors, given, thenStep, when } from "./support/uat";

const REQUESTER = "playwright/.auth/requester.json";
const REQUESTER2 = "playwright/.auth/requester2.json";
const FORBIDDEN = "Not enough permissions";
const NO_REQUESTS = "You have not submitted any requests yet";
const FILL_ALL = "Fill in all line fields";
const AWAITING = "Awaiting approval";
// «Початкова школа» з вимоги — назва відділу на проді (синтетичні дані, створює адміністратор).
const DEPARTMENT = "Primary School";

test.afterEach(async ({ page }) => attachRuntimeErrors(page));

/** Сторінка під іншою роллю в окремому контексті (працівник 1 поруч із працівником 2). */
async function asRole(browser: Browser, storageState: string): Promise<Page> {
  const context = await browser.newContext({ storageState });
  return context.newPage();
}

/** Адреса заявки працівника 1 у відділі «Початкова школа» зі статусом «Очікує схвалення» — з його «My requests»,
 * а не жорстко в коді. Відділ — як у «Дано» AC-FRM-08 (заявка в іншому відділі довела б слабшу умову). */
async function pendingRequestOf(page: Page): Promise<string> {
  await page.goto("/requests");
  const row = page.getByTestId("request-row").filter({ hasText: DEPARTMENT }).filter({ hasText: AWAITING }).first();
  await expect(row, `у працівника 1 має бути заявка «${AWAITING}» у відділі «${DEPARTMENT}» (Дано AC-FRM-08)`).toBeVisible();
  const href = await row.getByRole("link").first().getAttribute("href");
  expect(href).toMatch(/^\/requests\/[0-9a-f-]{36}$/);
  return href!;
}

test.describe("працівник 2/3 (member2@example.test)", () => {
  test.use({ storageState: REQUESTER2 });

  test(
    "AC-FRM-08: заявник того ж відділу відкриває чужу закупівлю за прямим посиланням — «Not enough permissions», даних не показано, статус не змінився",
    { tag: ["@uat"], annotation: { type: "ac", description: "AC-FRM-08" } },
    async ({ page, browser }) => {
      const author = await asRole(browser, REQUESTER);
      let href = "";
      // Окремий контекст закриваємо й тоді, коли крок упав.
      try {
        await given(
          "працівник 1 подав закупівлю у відділ «Початкова школа», а працівник 2 — заявник того ж відділу, не автор і не схвалювач",
          async () => {
            href = await pendingRequestOf(author);
          },
        );

        await when("працівник 2 відкриває закупівлю працівника 1 за прямим посиланням", async () => {
          await page.goto(href);
        });

        await thenStep(
          page,
          {
            clause:
              "він бачить повідомлення «Недостатньо прав», даних закупівлі йому не показано, а закупівля працівника 1 лишається зі статусом «Очікує схвалення».",
            visible: [`повідомлення «${FORBIDDEN}»`, "немає рядків закупівлі, суми чи автора — лише картка відмови"],
            hidden: [
              "на сторінці немає даних закупівлі: ні автора (data-testid=\"request-author\"), ні таблиці рядків, ні назви відділу",
              "закупівля працівника 1 лишається зі статусом «Awaiting approval» (перевірено в «My requests» працівника 1 після спроби)",
            ],
          },
          async () => {
            const card = page.getByRole("main").getByRole("alert");
            await expect(card).toBeVisible();
            await expect(card.getByText(FORBIDDEN, { exact: true })).toBeVisible();
            await expect(page.getByTestId("request-author")).toHaveCount(0);
            await expect(page.getByRole("main").getByRole("table")).toHaveCount(0);
            await expect(page.getByRole("main")).not.toContainText(DEPARTMENT);
            await author.goto("/requests");
            const row = author.getByTestId("request-row").filter({ has: author.locator(`a[href="${href}"]`) });
            await expect(row).toContainText(AWAITING);
          },
        );
      } finally {
        await author.context().close();
      }
    },
  );

  test(
    "AC-FRM-14: працівник без жодної поданої заявки відкриває «My requests» — «You have not submitted any requests yet», списку немає",
    { tag: ["@uat"], annotation: { type: "ac", description: "AC-FRM-14" } },
    async ({ page }) => {
      // Передумова — стан акаунта на проді: member2@example.test не подає заявок (домовлено з PM, перевірено вручну 03.11).
      // Незалежного read-only запиту з обліковими даними UAT немає (секретного ключа UAT не має), тож тест її не доводить.
      await given("працівник 3 без жодної поданої заявки", async () => {});

      await when("він відкриває сторінку «Мої заявки»", async () => {
        await page.goto("/requests");
      });

      await thenStep(
        page,
        {
          clause: "він бачить повідомлення «Ви ще не подали жодної заявки», а списку заявок немає.",
          visible: ["заголовок «My requests»", `повідомлення «${NO_REQUESTS}»`, "списку (таблиці) заявок немає"],
          hidden: ["немає жодного рядка заявки (data-testid=\"request-row\") і таблиці «my-requests»"],
        },
        async () => {
          await expect(page.getByRole("heading", { level: 1, name: "My requests" })).toBeVisible();
          await expect(page.getByTestId("no-requests")).toHaveText(NO_REQUESTS);
          await expect(page.getByTestId("my-requests")).toHaveCount(0);
          await expect(page.getByTestId("request-row")).toHaveCount(0);
        },
      );
    },
  );
});

test.describe("працівник 1 (pm-requester@example.test)", () => {
  test.use({ storageState: REQUESTER });

  test(
    "AC-FRM-15: рядок лише з назвою «Папір А4» — «Fill in all line fields», закупівлю не подано",
    { tag: ["@uat"], annotation: { type: "ac", description: "AC-FRM-15" } },
    async ({ page, browser }) => {
      // «Закупівлю не подано» перевіряємо на окремій сторінці того самого працівника: кадр «Тоді» знімається з page,
      // тож page лишається на формі з повідомленням (перший прогін 03.11 знімав «My requests» — NEEDS-HUMAN, R3).
      const own = await asRole(browser, REQUESTER);
      let before = 0;
      try {
        await given(
          "працівник 1 обрав відділ «Початкова школа», тип «Відділ закупівель» і додав рядок лише з назвою «Папір А4», без мети, кількості й ціни",
          async () => {
            await own.goto("/requests");
            before = await own.getByTestId("request-row").count();
            await page.goto("/requests/new");
            await page.getByTestId("purchase-department").click();
            await page.getByRole("option", { name: DEPARTMENT }).click();
            await page.getByTestId("purchase-type").click();
            await page.getByRole("option", { name: "Purchasing department" }).click();
            await page.getByLabel("Item").fill("Папір А4");
          },
        );

        await when("він намагається подати закупівлю", async () => {
          await page.getByRole("button", { name: "Submit" }).click();
        });

        await thenStep(
          page,
          {
            clause: "він бачить повідомлення «Заповніть усі поля рядка», а закупівлю не подано.",
            visible: [`повідомлення «${FILL_ALL}» над формою`, "форма лишається відкритою з назвою «Папір А4»"],
            hidden: [
              "закупівлю не подано: лишаємось на сторінці «New purchase», а кількість заявок у «My requests» (окрема вкладка того самого працівника) не змінилась",
            ],
          },
          async () => {
            await expect(page.getByRole("main").getByRole("alert")).toHaveText(FILL_ALL);
            await expect(page.getByLabel("Item")).toHaveValue("Папір А4");
            await expect(page).toHaveURL((url) => url.pathname === "/requests/new");
            await own.goto("/requests");
            await expect(own.getByTestId("request-row")).toHaveCount(before);
          },
        );
      } finally {
        await own.context().close();
      }
    },
  );
});
