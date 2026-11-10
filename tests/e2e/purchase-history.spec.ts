// UAT зрізу 3 (WS9) на проді: вимоги PM ValiaBihun/2026-quitcode-dream-team#63 (AC-DEC-01, 04, 06),
// ValiaBihun/2026-quitcode-dream-team#64 (AC-HIST-01, 02, 06, 10) і #49 (AC-LANG-09). AC-DEC-07 — після злиття задачі 5.
// «Тоді» в clause — дослівно з вимог; інтерфейс англійською (#49), тож перевіряємо дослівний переклад PM:
// «Частково схвалено» → «Partially approved», «Повернено на доопрацювання» → «Returned for revision», «Відхилено» /
// «Схвалено» (рядок) → «Rejected» / «Approved», «Вкажіть причину» → «Provide a reason», «Очікує схвалення» →
// «Awaiting approval», «Подано» → «Submitted», «Недостатньо прав» → «Not enough permissions».
//
// Записи на проді: автор кожної заявки — синтетичний uat-<прогін>-<AC>@example.test (createAuthor, секретний ключ),
// заявник «Primary School»; після прогону cleanup.teardown.ts видаляє його разом із заявками (OWNED_ROWS). Рішення
// ухвалює Марія (approver-primary@example.test) лише щодо цих заявок; Петро (approver-office@example.test) лише читає.
// «Дано» про ролі Марії й Петра тест перевіряє сам (крок given): акаунти спільні з PM, відділи призначає адміністратор.
import { expect, test, type Browser, type Page } from "@playwright/test";
import { createAuthor, requestStatus, submitAs, type UatAuthor } from "./support/admin";
import { attachRuntimeErrors, given, signIn, thenStep, when } from "./support/uat";

const MARIA = "playwright/.auth/maria.json";
const PETRO = "playwright/.auth/petro.json";
// «Початкова школа» й «Офіс» з вимог — назви відділів на проді (синтетичні дані, створює адміністратор).
const PRIMARY = "Primary School";
const OFFICE = "Office";
const THREE_LINES = [
  { name: "Папір А4", purpose: "Друк", quantity: "3", price: "20.00" },
  { name: "Маркери", purpose: "Дошка", quantity: "2", price: "15.50" },
  { name: "Зошити", purpose: "Уроки", quantity: "10", price: "2.50" },
];

test.afterEach(async ({ page }) => attachRuntimeErrors(page));

/** Сторінка синтетичного автора в окремому контексті (поруч зі схвалювачем): вхід через форму /login (пароль не
 * потрапляє у звіт — signIn). Контекст пише власне відео: Playwright записує лише сторінку тесту (прогін 10.11 —
 * частина автора без відео); closeAuthor додає це відео до тесту як «author-video». */
async function asAuthor(browser: Browser, author: UatAuthor): Promise<Page> {
  const size = { width: 1280, height: 800 };
  const context = await browser.newContext({ recordVideo: { dir: test.info().outputPath("author-video"), size } });
  const page = await context.newPage();
  await signIn(page, author.email, author.password);
  return page;
}

async function closeAuthor(page: Page) {
  await page.context().close();
  const video = page.video();
  if (video) await test.info().attach("author-video", { path: await video.path(), contentType: "video/webm" });
}

/** «Дано»: людина — схвалювач рівно цього відділу (таблиця відділів у «My profile»). */
async function approverOnlyOf(page: Page, department: string, who: string) {
  await page.goto("/profile");
  const rows = page.getByTestId("profile-departments").getByRole("row");
  const own = rows.filter({ has: page.getByRole("cell", { name: department, exact: true }) });
  await expect(own, `ПЕРЕДУМОВА НА ПРОДІ: ${who} — схвалювач відділу «${department}» (призначає адміністратор)`).toHaveCount(1);
  await expect(own.getByRole("cell").nth(1)).toHaveText("Requester and approver");
  // Схвалювач лише цього відділу: жодного іншого рядка з роллю схвалювача.
  await expect(
    rows.filter({ has: page.getByRole("cell", { name: "Requester and approver", exact: true }) }),
    `ПЕРЕДУМОВА НА ПРОДІ: ${who} схвалює лише «${department}»`,
  ).toHaveCount(1);
}

/** Рядок заявки в таблиці рядків за назвою позиції. */
const lineRow = (page: Page, item: string) =>
  page.getByRole("main").getByRole("row").filter({ has: page.getByRole("cell", { name: item, exact: true }) });

test.describe("схвалювач Марія (approver-primary@example.test)", () => {
  test.use({ storageState: MARIA });

  test(
    "AC-DEC-01: Марія відхиляє рядок 2 і схвалює — «Partially approved», рядок 2 «Rejected», рядки 1 і 3 «Approved»",
    { tag: ["@uat", "@writes"], annotation: { type: "ac", description: "AC-DEC-01" } },
    async ({ page, browser }) => {
      let id = "";
      let author: UatAuthor;
      await given(
        "заявка відділу «Початкова школа» з трьома рядками зі статусом «Очікує схвалення», автор — не Марія, Марія схвалює цей відділ",
        async () => {
          await approverOnlyOf(page, PRIMARY, "approver-primary@example.test");
          author = await createAuthor(PRIMARY, "dec01");
          id = await submitAs(author, PRIMARY, THREE_LINES);
          expect(await requestStatus(id)).toBe("pending");
        },
      );

      await when("Марія відхиляє рядок 2 і схвалює заявку", async () => {
        await page.goto(`/requests/${id}`);
        await page.getByRole("checkbox", { name: /^Reject line 2:/ }).click();
        await page.getByRole("button", { name: /^Partially approve:/ }).click();
        await page.waitForURL((url) => url.pathname === "/approvals");
      });

      const own = await asAuthor(browser, author!);
      try {
        await own.goto(`/requests/${id}`);
        await thenStep(
          own,
          {
            clause:
              "статус заявки «Частково схвалено», автор бачить рядок 2 зі статусом «Відхилено», а рядки 1 і 3 — зі статусом «Схвалено».",
            visible: [
              "статус заявки «Partially approved»",
              "у колонці «Line status»: «Маркери» (рядок 2) — «Rejected», «Папір А4» (рядок 1) і «Зошити» (рядок 3) — «Approved»",
            ],
            hidden: ["сторінку відкрив автор заявки (синтетичний uat-…-dec01), а не Марія; статус у базі — partially_approved"],
          },
          async () => {
            await expect(own.getByTestId("purchase-status").first()).toHaveText("Partially approved");
            await expect(lineRow(own, "Маркери").getByTestId("line-status")).toHaveText("Rejected");
            await expect(lineRow(own, "Папір А4").getByTestId("line-status")).toHaveText("Approved");
            await expect(lineRow(own, "Зошити").getByTestId("line-status")).toHaveText("Approved");
            expect(await requestStatus(id)).toBe("partially_approved");
          },
        );
      } finally {
        await closeAuthor(own);
      }
    },
  );

  test(
    "AC-DEC-04: Марія повертає заявку з причиною «Уточніть кількість» — «Returned for revision»",
    { tag: ["@uat", "@writes"], annotation: { type: "ac", description: "AC-DEC-04" } },
    async ({ page }) => {
      let id = "";
      await given(
        "заявка відділу «Початкова школа» зі статусом «Очікує схвалення», автор — не Марія, Марія схвалює цей відділ",
        async () => {
          await approverOnlyOf(page, PRIMARY, "approver-primary@example.test");
          id = await submitAs(await createAuthor(PRIMARY, "dec04"), PRIMARY, THREE_LINES.slice(0, 1));
          expect(await requestStatus(id)).toBe("pending");
        },
      );

      await when("Марія повертає заявку на доопрацювання з причиною «Уточніть кількість»", async () => {
        await page.goto(`/requests/${id}`);
        await page.getByRole("button", { name: /^Return for revision:/ }).click();
        const dialog = page.getByRole("dialog");
        await dialog.getByLabel("Reason").fill("Уточніть кількість");
        await dialog.getByRole("button", { name: "Return for revision" }).click();
        await page.waitForURL((url) => url.pathname === "/approvals");
        await page.goto(`/requests/${id}`);
      });

      await thenStep(
        page,
        {
          clause: "статус заявки «Повернено на доопрацювання».",
          visible: ["статус заявки «Returned for revision»", "причина повернення «Уточніть кількість»"],
          hidden: ["статус у базі — returned"],
        },
        async () => {
          await expect(page.getByTestId("purchase-status").first()).toHaveText("Returned for revision");
          await expect(page.getByTestId("return-reason")).toHaveText("Уточніть кількість");
          expect(await requestStatus(id)).toBe("returned");
        },
      );
    },
  );

  test(
    "AC-DEC-06: повернення без причини — «Provide a reason», статус лишається «Awaiting approval»",
    { tag: ["@uat", "@writes"], annotation: { type: "ac", description: "AC-DEC-06" } },
    async ({ page }) => {
      let id = "";
      await given("заявка відділу «Початкова школа» зі статусом «Очікує схвалення», Марія схвалює цей відділ", async () => {
        await approverOnlyOf(page, PRIMARY, "approver-primary@example.test");
        id = await submitAs(await createAuthor(PRIMARY, "dec06"), PRIMARY, THREE_LINES.slice(0, 1));
        expect(await requestStatus(id)).toBe("pending");
      });

      await when("Марія повертає заявку на доопрацювання без причини", async () => {
        await page.goto(`/requests/${id}`);
        await page.getByRole("button", { name: /^Return for revision:/ }).click();
        await page.getByRole("dialog").getByRole("button", { name: "Return for revision" }).click();
      });

      // Два «Тоді» з окремими кадрами: діалог із повідомленням (кадр знімаємо, поки діалог відкритий — прогін 10.11
      // закривав його до кадру, і агент слушно не бачив повідомлення) і сторінка після закриття діалогу.
      await thenStep(
        page,
        {
          clause: "вона бачить повідомлення «Вкажіть причину»",
          visible: ["повідомлення «Provide a reason» у відкритому діалозі «Return for revision»"],
        },
        async () => {
          await expect(page.getByRole("dialog").getByRole("alert")).toHaveText("Provide a reason");
        },
      );

      await thenStep(
        page,
        {
          clause: "а статус заявки лишається «Очікує схвалення».",
          visible: ["після закриття діалогу й оновлення сторінки статус заявки — «Awaiting approval»"],
          hidden: ["статус заявки в базі лишається pending"],
        },
        async () => {
          expect(await requestStatus(id)).toBe("pending");
          await page.keyboard.press("Escape");
          await page.reload();
          await expect(page.getByTestId("purchase-status").first()).toHaveText("Awaiting approval");
        },
      );
    },
  );

  test(
    "AC-LANG-09: статуси «Partially approved» і «Returned for revision» підписано текстом у списку й на сторінці заявки",
    { tag: ["@uat", "@writes"], annotation: { type: "ac", description: "AC-LANG-09" } },
    async ({ page, browser }) => {
      let author: UatAuthor;
      let partial = "";
      let returned = "";
      await given("заявки зі статусом «Частково схвалено» і «Повернено на доопрацювання»", async () => {
        author = await createAuthor(PRIMARY, "lang09");
        partial = await submitAs(author, PRIMARY, THREE_LINES.slice(0, 2));
        returned = await submitAs(author, PRIMARY, THREE_LINES.slice(2));
        await page.goto(`/requests/${partial}`);
        await page.getByRole("checkbox", { name: /^Reject line 2:/ }).click();
        await page.getByRole("button", { name: /^Partially approve:/ }).click();
        await page.waitForURL((url) => url.pathname === "/approvals");
        await page.goto(`/requests/${returned}`);
        await page.getByRole("button", { name: /^Return for revision:/ }).click();
        await page.getByRole("dialog").getByLabel("Reason").fill("Уточніть кількість");
        await page.getByRole("dialog").getByRole("button", { name: "Return for revision" }).click();
        await page.waitForURL((url) => url.pathname === "/approvals");
        expect(await requestStatus(partial)).toBe("partially_approved");
        expect(await requestStatus(returned)).toBe("returned");
      });

      const own = await asAuthor(browser, author!);
      try {
        await when("їх показано у списку «My requests» автора", async () => {
          await own.goto("/requests");
        });
        const row = (id: string) => own.getByTestId("request-row").filter({ has: own.locator(`a[href="/requests/${id}"]`) });
        await thenStep(
          own,
          {
            clause: "статус підписано текстом «Partially approved» чи «Returned for revision» відповідно, а не лише кольором.",
            visible: ["у списку «My requests» дві заявки з текстовими статусами «Partially approved» і «Returned for revision»"],
          },
          async () => {
            await expect(row(partial).getByTestId("purchase-status")).toHaveText("Partially approved");
            await expect(row(returned).getByTestId("purchase-status")).toHaveText("Returned for revision");
          },
        );

        await when("заявку «Повернено на доопрацювання» показано на сторінці заявки", async () => {
          await own.goto(`/requests/${returned}`);
        });
        await thenStep(
          own,
          {
            clause: "статус підписано текстом «Returned for revision», а не лише кольором.",
            visible: ["статус заявки текстом «Returned for revision»"],
            hidden: ["«в історії» — записів рішень у WS9 немає (відповідь PM на ValiaBihun/2026-quitcode-dream-team#75)"],
          },
          async () => {
            await expect(own.getByTestId("purchase-status").first()).toHaveText("Returned for revision");
          },
        );
      } finally {
        await closeAuthor(own);
      }
    },
  );
});

test.describe("синтетичний автор (працівник 1)", () => {
  test(
    "AC-HIST-01: працівник 1 подає дві закупівлі — у «My requests» номери PUR-n і PUR-(n+1)",
    { tag: ["@uat", "@writes"], annotation: { type: "ac", description: "AC-HIST-01" } },
    async ({ page }) => {
      let author: UatAuthor;
      await given(
        "в системі ще немає жодної закупівлі (на проді — у працівника 1 ще немає жодної; номери глобальні, відповідь PM на ValiaBihun/2026-quitcode-dream-team#73)",
        async () => {
          author = await createAuthor(PRIMARY, "hist01");
          // Автор — на сторінці тесту (її пише відео прогону).
          await signIn(page, author.email, author.password);
          await page.goto("/requests");
          await expect(page.getByTestId("no-requests")).toBeVisible();
        },
      );

      try {
        await when("працівник 1 подає першу закупівлю, а потім другу", async () => {
          for (const line of THREE_LINES.slice(0, 2)) {
            await page.goto("/requests/new");
            await page.getByTestId("purchase-department").click();
            await page.getByRole("option", { name: PRIMARY }).click();
            await page.getByTestId("purchase-type").click();
            await page.getByRole("option", { name: "Purchasing department" }).click();
            await page.getByLabel("Item").fill(line.name);
            await page.getByLabel("Purpose").fill(line.purpose);
            await page.getByLabel("Quantity").fill(line.quantity);
            await page.getByLabel("Price").fill(line.price);
            await page.getByRole("button", { name: "Submit" }).click();
            await page.waitForURL((url) => url.pathname === "/requests");
          }
        });

        await thenStep(
          page,
          {
            clause:
              "в списку «Мої заявки» вони мають номери «PUR-1» і «PUR-2» (на проді — «PUR-n» і «PUR-(n+1)»: друга на одиницю більша).",
            visible: ["у «My requests» дві заявки з номерами PUR-n (перша) і PUR-(n+1) (друга, вище в списку)"],
            hidden: ["PUR-1 і PUR-2 на порожній базі доводить автотест tests/db/purchase-number.test.ts (відповідь PM на #73)"],
          },
          async () => {
            const numbers = await page.getByTestId("request-row").getByRole("link").allInnerTexts();
            expect(numbers).toHaveLength(2);
            const [second, first] = numbers.map((n) => Number(/^PUR-(\d+)$/.exec(n.trim())?.[1]));
            expect(first).toBeGreaterThan(0);
            expect(second).toBe(first + 1);
          },
        );
      } finally {
        await page.context().clearCookies();
      }
    },
  );

  test(
    "AC-HIST-02: рядки 3 × 20.00 і 2 × 15.50 — суми рядків 60.00 і 31.00, сума заявки 91.00",
    { tag: ["@uat", "@writes"], annotation: { type: "ac", description: "AC-HIST-02" } },
    async ({ page }) => {
      let author: UatAuthor;
      let id = "";
      await given("закупівля з двома рядками: кількість 3 за ціною 20.00 і кількість 2 за ціною 15.50", async () => {
        author = await createAuthor(PRIMARY, "hist02");
        id = await submitAs(author, PRIMARY, THREE_LINES.slice(0, 2));
      });

      // Автор — на сторінці тесту (її пише відео прогону).
      await signIn(page, author!.email, author!.password);
      try {
        await when("автор відкриває заявку", async () => {
          await page.goto(`/requests/${id}`);
        });

        await thenStep(
          page,
          {
            clause: "суми рядків 60.00 і 31.00, а сума заявки 91.00.",
            visible: ["«Sum, USD»: «Папір А4» — 60.00, «Маркери» — 31.00", "«Total» — 91.00"],
          },
          async () => {
            await expect(lineRow(page, "Папір А4").getByRole("cell").nth(4)).toHaveText("60.00");
            await expect(lineRow(page, "Маркери").getByRole("cell").nth(4)).toHaveText("31.00");
            await expect(page.getByTestId("request-total")).toHaveText("91.00");
          },
        );
      } finally {
        await page.context().clearCookies();
      }
    },
  );

  test(
    "AC-HIST-06: в історії запис «Submitted» з іменем автора і датою та часом America/New_York",
    { tag: ["@uat", "@writes"], annotation: { type: "ac", description: "AC-HIST-06" } },
    async ({ page }) => {
      let author: UatAuthor;
      let id = "";
      let submittedAt = new Date();
      await given("працівник 1 подав закупівлю у відділ «Початкова школа»", async () => {
        author = await createAuthor(PRIMARY, "hist06");
        submittedAt = new Date();
        id = await submitAs(author, PRIMARY, THREE_LINES.slice(0, 1));
      });

      // Автор — на сторінці тесту (її пише відео прогону).
      await signIn(page, author!.email, author!.password);
      try {
        await when("він відкриває історію цієї заявки", async () => {
          await page.goto(`/requests/${id}`);
        });

        // Очікувана дата за America/New_York — та сама, що в момент подання (формат «05.11.2026, 14:32», #74).
        const day = new Intl.DateTimeFormat("uk-UA", {
          timeZone: "America/New_York",
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
        }).format(submittedAt);
        await thenStep(
          page,
          {
            clause: "в історії є запис «Подано» з його іменем і датою та часом за часом `America/New_York`.",
            visible: [`у «History» запис «Submitted · ${author!.fullName} · ${day}, ГГ:ХХ»`],
            hidden: ["дата й година — за America/New_York (браузер тесту — Europe/Kyiv, тож час не з браузера)"],
          },
          async () => {
            const entry = page.getByTestId("request-history").getByRole("listitem").first();
            await expect(entry).toHaveText(new RegExp(`^Submitted · ${author!.fullName} · ${day.replace(/\./g, "\\.")}, \\d{2}:\\d{2}$`));
            const nyTime = new Intl.DateTimeFormat("en-GB", {
              timeZone: "America/New_York",
              hour: "2-digit",
              minute: "2-digit",
              hourCycle: "h23",
            });
            const shown = (await entry.innerText()).slice(-5);
            // Хвилина подання за Нью-Йорком (± 1 хв на час між запитом і записом).
            const allowed = [-60_000, 0, 60_000].map((d) => nyTime.format(new Date(submittedAt.getTime() + d)));
            expect(allowed).toContain(shown);
          },
        );
      } finally {
        await page.context().clearCookies();
      }
    },
  );
});

test.describe("схвалювач Петро (approver-office@example.test)", () => {
  test.use({ storageState: PETRO });

  test(
    "AC-HIST-10: Петро («Office») відкриває заявку «Primary School» за прямим посиланням — «Not enough permissions», історії немає, статус не змінився",
    { tag: ["@uat", "@writes"], annotation: { type: "ac", description: "AC-HIST-10" } },
    async ({ page }) => {
      let id = "";
      await given("Петро схвалює лише відділ «Офіс», заявка відділу «Початкова школа» з історією рішень", async () => {
        await approverOnlyOf(page, OFFICE, "approver-office@example.test");
        id = await submitAs(await createAuthor(PRIMARY, "hist10"), PRIMARY, THREE_LINES.slice(0, 1));
        expect(await requestStatus(id)).toBe("pending");
      });

      await when("Петро відкриває історію цієї заявки за прямим посиланням", async () => {
        await page.goto(`/requests/${id}`);
      });

      await thenStep(
        page,
        {
          clause: "він бачить повідомлення «Недостатньо прав», історії не показано, а статус заявки не змінився.",
          visible: ["повідомлення «Not enough permissions»", "немає розділу «History» і даних заявки — лише картка відмови"],
          hidden: ["статус заявки в базі лишається pending"],
        },
        async () => {
          const card = page.getByRole("main").getByRole("alert");
          await expect(card.getByText("Not enough permissions", { exact: true })).toBeVisible();
          await expect(page.getByTestId("request-history")).toHaveCount(0);
          await expect(page.getByRole("main").getByRole("table")).toHaveCount(0);
          await expect(page.getByRole("main")).not.toContainText("History");
          expect(await requestStatus(id)).toBe("pending");
        },
      );
    },
  );
});
