// UAT за 3 AC WS8 (вимога PM ValiaBihun/2026-quitcode-dream-team#47) на проді. Записів не створює: AC-FRM-08 і
// AC-FRM-14 лише читають, AC-FRM-15 пробує подати неповний рядок і отримує відмову (закупівлю не подано).
// «Тоді» в clause — дослівно з #47. Інтерфейс англійською за вимогою #49 (AC-LANG-03 і таблиця текстів PM), тож
// твердження перевіряють дослівний переклад PM з цієї таблиці: «Недостатньо прав» → «Not enough permissions»,
// «Ви ще не подали жодної заявки» → «You have not submitted any requests yet», «Заповніть усі поля рядка» →
// «Fill in all line fields», «Очікує схвалення» → «Awaiting approval».
// Акаунти (auth.setup.ts): requester — працівник 1, pm-requester@example.test; requester2 — працівник 2/3,
// member2@example.test (той самий відділ «Primary School», не автор, не схвалювач, без поданих заявок). Акаунти спільні з
// PM, тож ці умови «Дано» тест перевіряє сам (крок given) — і, якщо їх порушено, падає в «Дано», а не в «Тоді».
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
const ITEM = "Папір А4";

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
  // Акаунти спільні з PM: якщо PM вирішила останню таку заявку, падає «Дано» — це брак даних на проді, а не вада застосунку.
  await expect(
    row,
    `ПЕРЕДУМОВА НА ПРОДІ, не вада застосунку: у працівника 1 має бути заявка «${AWAITING}» у відділі «${DEPARTMENT}» (Дано AC-FRM-08) — подайте її під pm-requester@example.test і повторіть прогін`,
  ).toBeVisible();
  const href = await row.getByRole("link").first().getAttribute("href");
  expect(href).toMatch(/^\/requests\/[0-9a-f-]{36}$/);
  return href!;
}

/** Адреси заявок на першій сторінці «My requests» працівника (список відсортовано від нових). */
async function requestLinks(page: Page): Promise<string[]> {
  await page.goto("/requests");
  return page
    .getByTestId("request-row")
    .getByRole("link")
    .evaluateAll((links) => links.map((a) => a.getAttribute("href") ?? ""));
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
            // Працівник 2 — заявник «Початкової школи»: у формі подання є лише відділи, де він заявник (AC-FRM-01).
            await page.goto("/requests/new");
            await page.getByTestId("purchase-department").click();
            await expect(
              page.getByRole("option", { name: DEPARTMENT }),
              `ПЕРЕДУМОВА НА ПРОДІ: member2@example.test має бути заявником відділу «${DEPARTMENT}»`,
            ).toBeVisible();
            await page.keyboard.press("Escape");
            // Не схвалювач жодного відділу: пункту «Awaiting decision» у бічній панелі немає.
            await expect(
              page.getByRole("link", { name: /Awaiting decision/ }),
              "ПЕРЕДУМОВА НА ПРОДІ: member2@example.test не має бути схвалювачем",
            ).toHaveCount(0);
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
      // Передумову перевіряємо незалежно від «My requests»: на головній лічильники власних заявок за статусами — нулі.
      await given("працівник 3 без жодної поданої заявки", async () => {
        await page.goto("/");
        for (const stat of ["stat-pending", "stat-approved", "stat-rejected"]) {
          await expect(
            page.getByTestId(stat),
            "ПЕРЕДУМОВА НА ПРОДІ, не вада застосунку: у member2@example.test не має бути поданих заявок",
          ).toHaveText("0");
        }
      });

      await when("він відкриває сторінку «Мої заявки»", async () => {
        await page.goto("/requests");
      });

      await thenStep(
        page,
        {
          clause: "він бачить повідомлення «Ви ще не подали жодної заявки», а списку заявок немає.",
          visible: ["заголовок «My requests»", `повідомлення «${NO_REQUESTS}»`],
          // «Списку немає» — відсутність: кадр її не цитує (агент казав NEEDS-HUMAN), тож доводить перевірка.
          hidden: ["списку заявок немає: жодного рядка заявки (data-testid=\"request-row\") і таблиці «my-requests»"],
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
      let before: string[] = [];
      try {
        await given(
          "працівник 1 обрав відділ «Початкова школа», тип «Відділ закупівель» і додав рядок лише з назвою «Папір А4», без мети, кількості й ціни",
          async () => {
            before = await requestLinks(own);
            await page.goto("/requests/new");
            await page.getByTestId("purchase-department").click();
            await page.getByRole("option", { name: DEPARTMENT }).click();
            await page.getByTestId("purchase-type").click();
            await page.getByRole("option", { name: "Purchasing department" }).click();
            await page.getByLabel("Item").fill(ITEM);
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
              "закупівлю не подано: лишаємось на сторінці «New purchase», а серед нових заявок у «My requests» (окрема вкладка того самого працівника) немає жодної з «Папір А4»",
            ],
          },
          async () => {
            await expect(page.getByRole("main").getByRole("alert")).toHaveText(FILL_ALL);
            await expect(page.getByLabel("Item")).toHaveValue(ITEM);
            await expect(page).toHaveURL((url) => url.pathname === "/requests/new");
            // Акаунт спільний з PM: нова заявка за час прогону може бути її. Тож не рахуємо рядки, а відкриваємо кожну
            // нову (список — від нових, перша сторінка) і перевіряємо, що це не наша з «Папір А4».
            for (const href of (await requestLinks(own)).filter((h) => !before.includes(h))) {
              await own.goto(href);
              await expect(own.getByRole("main")).not.toContainText(ITEM);
            }
          },
        );
      } finally {
        await own.context().close();
      }
    },
  );
});
