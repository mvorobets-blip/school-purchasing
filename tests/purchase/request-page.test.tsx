import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { messageFor } from "@/lib/org/messages";
import { withUser } from "../support/current-user";

// Сторінка заявки (server component) з підміненим клієнтом Supabase. Хто бачить заявку, вирішує RLS
// (tests/db/purchase.test.ts); тут — що показує сторінка за кожної відповіді бази.
const ID = "11111111-1111-4111-8111-111111111111";
const ONE_LINE = [{ position: 1, name: "Папір А4", purpose: "Друк", quantity: 3, price: 20 }];
const db: {
  request: Record<string, unknown> | null;
  lines: Record<string, unknown>[];
  linesError: boolean;
  authorError: boolean;
  history: Record<string, unknown>[];
  historyError?: boolean;
  canDecide?: boolean;
} = {
  request: null,
  lines: ONE_LINE,
  linesError: false,
  authorError: false,
  history: [],
};
const queried: string[] = [];
// Колонки, які сторінка вибирає з кожної таблиці (select) — щоб перевірити, що статус рядка справді запитано.
const selected: Record<string, string> = {};
const rpcCalls: { fn: string; args: unknown }[] = [];
// Запис історії, який повертає request_history (AC-HIST-06): 19:32 UTC 5 листопада — 14:32 у Нью-Йорку (EST).
const SUBMITTED = { kind: "submitted", actor_name: "PM Demo Requester", created_at: "2026-11-05T19:32:00Z" };

// rpc за назвою функції: request_author_names — як раніше; request_history — записи історії.
async function rpc(fn: string, args: unknown) {
  rpcCalls.push({ fn, args });
  if (fn === "request_history") return db.historyError ? { data: null, error: { message: "boom" } } : { data: db.history, error: null };
  if (fn === "can_decide_purchase") return { data: db.canDecide ?? false, error: null };
  return db.authorError
    ? { data: null, error: { message: "boom" } }
    : { data: db.request ? [{ request_id: ID, author_name: "Андрій Демо-Перший" }] : [], error: null };
}

function query(table: string) {
  queried.push(table);
  const result = () => {
    if (table === "purchase_requests") return { data: db.request, error: null };
    if (table === "purchase_request_lines") {
      return db.linesError
        ? { data: null, error: { message: "boom" } }
        : { data: db.lines, error: null };
    }
    return { data: { name: "Початкова школа" }, error: null };
  };
  const builder = {
    select: (columns: string) => {
      selected[table] = columns;
      return builder;
    },
    eq: () => builder,
    order: () => builder,
    maybeSingle: () => builder,
    then: (resolve: (v: unknown) => void) => resolve(result()),
  };
  return builder;
}

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`);
  },
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () =>
    withUser(
      { id: "u1", role: "requester", isActive: true },
      {
        from: query,
        rpc,
      },
    ),
}));

const { default: RequestPage } = await import("@/app/(portal)/requests/[id]/page");

const render = async (search: Record<string, string> = {}) =>
  renderToStaticMarkup(
    await RequestPage({ params: Promise.resolve({ id: ID }), searchParams: Promise.resolve(search) } as never),
  );

describe("сторінка заявки", () => {
  beforeEach(() => {
    db.request = {
      id: ID,
      number: 7,
      department_id: "d1",
      purchase_type: "purchasing_department",
      status: "pending",
      reject_reason: null,
      created_at: "2026-10-26T10:00:00Z",
    };
    db.lines = ONE_LINE;
    db.linesError = false;
    db.authorError = false;
    db.history = [SUBMITTED];
    db.historyError = false;
    db.canDecide = false;
    queried.length = 0;
    rpcCalls.length = 0;
    for (const key of Object.keys(selected)) delete selected[key];
  });

  it("сторінка заявки з моком: порожня відповідь бази (чужа заявка) — картка «Недостатньо прав» без даних (правило доводить тест бази tests/db/purchase.test.ts)", async () => {
    db.request = null;
    const html = await render();
    expect(html).toContain(messageFor("FORBIDDEN"));
    expect(html).not.toContain("Папір А4");
  });

  it("AC-APR-08: на сторінці заявки поруч із рядками вказано автора під підписом «Author»", async () => {
    const html = await render();
    expect(html).toContain("Папір А4");
    expect(html).toContain(">Author</dt>");
    expect(html).toMatch(/data-testid="request-author"[^>]*>Андрій Демо-Перший</);
  });

  it("AC-APR-10: сторінка заявки не читає профілю, відділів і дозволів автора", async () => {
    await render();
    expect(queried).not.toContain("profiles");
    expect(queried).not.toContain("department_members");
    expect(queried).not.toContain("employee_permissions");
  });

  it("AC-LANG-03: чужа заявка — «Not enough permissions» англійською, вміст заявки не розкрито", async () => {
    db.request = null;
    const html = await render();
    expect(html).toContain("Not enough permissions");
    expect(html).not.toContain("Недостатньо прав");
    expect(html).not.toContain("Папір А4");
  });

  it("AC-LANG-06: статус на сторінці заявки підписано текстом «Awaiting approval»", async () => {
    const html = await render();
    expect(html).toMatch(/data-testid="purchase-status"[^>]*>Awaiting approval</);
  });

  it("AC-APR-07: відхилена заявка — статус «Rejected» і причина поруч", async () => {
    db.request = { ...db.request, status: "rejected", reject_reason: "Немає бюджету" };
    const html = await render();
    expect(html).toContain("Rejected");
    expect(html).toContain("Немає бюджету");
  });

  it("AC-DEC-04: автор бачить статус «Returned for revision» і поруч «Return reason» з текстом «Уточніть кількість»", async () => {
    db.request = { ...db.request, status: "returned", return_reason: "Уточніть кількість" };
    const html = await render();
    // Сторінка справді запитує причину повернення з бази.
    // return_reason — явно або через «*» (сторінка не падає до міграції).
    expect(selected.purchase_requests).toMatch(/\breturn_reason\b|^\*$/);
    expect(html).toMatch(/data-testid="purchase-status"[^>]*>Returned for revision</);
    expect(html).toContain(">Return reason</dt>");
    expect(html).toMatch(/data-testid="return-reason"[^>]*>Уточніть кількість</);
    // Причина повернення — поруч зі статусом (у тому самому блоці відомостей), а не в іншому розділі сторінки.
    const details = html.slice(html.indexOf('data-testid="purchase-status"'), html.indexOf("</dl>"));
    expect(details).toContain("Уточніть кількість");
  });

  it("AC-LANG-09: статус «Повернено на доопрацювання» на сторінці заявки підписано текстом «Returned for revision»", async () => {
    db.request = { ...db.request, status: "returned", return_reason: "Уточніть кількість" };
    const html = await render();
    expect(html).toMatch(/data-testid="purchase-status"[^>]*>Returned for revision</);
    expect(html).not.toContain("Повернено на доопрацювання");
  });

  it("причину повернення не показано в заявки з іншим статусом", async () => {
    db.request = { ...db.request, status: "pending", return_reason: "Стара причина" };
    const html = await render();
    expect(html).not.toContain("Return reason");
    expect(html).not.toContain("Стара причина");
  });

  it("«← Назад»: зі списку «Awaiting decision» — туди, інакше — до «My requests»", async () => {
    const fromApprovals = await render({ from: "approvals" });
    expect(fromApprovals).toMatch(/href="\/approvals"[^>]*>.*Awaiting decision/);
    const direct = await render();
    expect(direct).toMatch(/href="\/requests"[^>]*>.*My requests/);
    expect(direct).not.toContain("Awaiting decision");
  });

  it("помилка запиту автора — повідомлення про помилку, а не «—» замість імені", async () => {
    db.authorError = true;
    const html = await render();
    expect(html).toContain("Could not load the request. Refresh the page.");
    expect(html).not.toContain("Папір А4");
  });

  it("помилка завантаження рядків — повідомлення про помилку, а не порожня таблиця", async () => {
    db.linesError = true;
    const html = await render();
    expect(html).toContain('role="alert"');
    expect(html).not.toContain("<table");
    expect(html).not.toContain(messageFor("FORBIDDEN"));
  });

  it("AC-HIST-02: рядки 3 × 20.00 і 2 × 15.50 — під заголовком «Sum, USD» суми 60.00 і 31.00, «Total» 91.00", async () => {
    db.lines = [
      { position: 1, name: "Папір А4", purpose: "Друк", quantity: 3, price: 20 },
      { position: 2, name: "Маркери", purpose: "Для дошки", quantity: 2, price: 15.5 },
    ];
    const html = await render();
    expect(html).toMatch(/<th[^>]*>Sum, USD<\/th>/);
    const cells = [...html.matchAll(/<td[^>]*>([^<]*)<\/td>/g)].map((m) => m[1]);
    expect(cells).toContain("60.00");
    expect(cells).toContain("31.00");
    expect(html.indexOf("60.00")).toBeLessThan(html.indexOf("31.00"));
    expect(html).toMatch(/Total[\s\S]*?>91\.00</);
  });

  it("сторінка заявки показує її номер «PUR-7»", async () => {
    const html = await render();
    expect(html).toContain("PUR-7");
  });

  it("сума рядка без похибки рухомої коми: 3 × 0.10 — 0.30, «Total» 0.30", async () => {
    db.lines = [{ position: 1, name: "Скріпки", purpose: "Офіс", quantity: 3, price: 0.1 }];
    const html = await render();
    expect(html).not.toContain("0.30000000000000004");
    expect(html).toMatch(/Total[\s\S]*?>0\.30</);
  });

  // Рев'ю: старий рядок зрізу 2 з кількістю 1e-7 (String(1e-7) === "1e-7") не ламає сторінку — сума 0.00.
  it("старий рядок з кількістю 1e-7 (експонентний запис числа) — сторінка відкривається, сума рядка й «Total» 0.00", async () => {
    db.lines = [{ position: 1, name: "Скріпки", purpose: "Офіс", quantity: 1e-7, price: 20 }];
    const html = await render();
    const cells = [...html.matchAll(/<td[^>]*>([^<]*)<\/td>/g)].map((m) => m[1]);
    expect(cells).toContain("0.00");
    expect(html).toMatch(/Total[\s\S]*?>0\.00</);
  });

  it("AC-HIST-06: розділ «History» із записом «Submitted · PM Demo Requester · 05.11.2026, 14:32»", async () => {
    const html = await render();
    expect(rpcCalls).toContainEqual({ fn: "request_history", args: { p_request_id: ID } });
    expect(html).toContain("History");
    // Текст без розмітки між частинами запису: «Submitted · ім'я · дата, час».
    const text = html.replace(/<[^>]+>/g, "");
    expect(text).toContain("Submitted · PM Demo Requester · 05.11.2026, 14:32");
  });

  it("AC-HIST-10: чужа заявка (схвалювач іншого відділу) — «Not enough permissions», розділу «History» і записів немає", async () => {
    db.request = null;
    // Навіть якби база віддала записи, сторінка їх не показує.
    db.history = [SUBMITTED];
    const html = await render();
    expect(html).toContain("Not enough permissions");
    expect(html).not.toContain("History");
    expect(html).not.toContain("Submitted");
    expect(html).not.toContain("PM Demo Requester");
    expect(html).not.toContain("05.11.2026");
    // Історію навіть не запитують, доки не з'ясовано, що заявку видно.
    expect(rpcCalls.map((c) => c.fn)).not.toContain("request_history");
  });

  // Рев'ю CodeRabbit (PR 59): помилка історії не ховає заявку.
  it("помилка завантаження історії — заявка й рядки на місці, у розділі «History» повідомлення про помилку", async () => {
    db.historyError = true;
    const html = await render();
    expect(html).toContain("Папір А4");
    expect(html).toContain("History");
    expect(html).toContain("Could not load the history. Refresh the page.");
    expect(html).not.toContain("Could not load the request");
  });

  it("AC-DEC-01: автор бачить «Partially approved», а в колонці «Line status» — рядок 2 «Rejected», рядки 1 і 3 «Approved»", async () => {
    db.request = { ...db.request, status: "partially_approved" };
    db.lines = [
      { position: 1, name: "Папір А4", purpose: "Друк", quantity: 3, price: 20, status: "approved" },
      { position: 2, name: "Маркери", purpose: "Для дошки", quantity: 2, price: 15.5, status: "rejected" },
      { position: 3, name: "Скріпки", purpose: "Офіс", quantity: 5, price: 1, status: "approved" },
    ];
    const html = await render();
    expect(selected.purchase_request_lines).toMatch(/\bstatus\b/);
    expect(html).toMatch(/data-testid="purchase-status"[^>]*>Partially approved</);
    expect(html).toMatch(/<th[^>]*>Line status<\/th>/);
    // Рядки тіла таблиці: статус кожного — у його власному <tr>.
    const tbody = html.slice(html.indexOf("<tbody"), html.indexOf("</tbody>"));
    const rows = [...tbody.matchAll(/<tr[\s\S]*?<\/tr>/g)].map((m) => m[0].replace(/<[^>]+>/g, " "));
    const rowOf = (name: string) => rows.find((r) => r.includes(name)) ?? "";
    expect(rows).toHaveLength(3);
    expect(rowOf("Маркери")).toMatch(/\bRejected\b/);
    expect(rowOf("Маркери")).not.toMatch(/\bApproved\b/);
    for (const name of ["Папір А4", "Скріпки"]) {
      expect(rowOf(name)).toMatch(/\bApproved\b/);
      expect(rowOf(name)).not.toMatch(/\bRejected\b/);
    }
  });

  // Сторона схвалювача AC-DEC-01 (тест дописав розробник за незалежним рев'ю задачі 3).
  it("AC-DEC-01: схвалювач відділу бачить колонку «Reject line» з прапорцем на кожному рядку й кнопку «Approve»", async () => {
    db.canDecide = true;
    db.lines = [
      { position: 1, name: "Папір А4", purpose: "Друк", quantity: 3, price: 20, status: null },
      { position: 2, name: "Маркери", purpose: "Дошка", quantity: 2, price: 15.5, status: null },
    ];
    const html = await render();
    expect(html).toContain(">Reject line</th>");
    expect(html).toContain('aria-label="Reject line 1: Папір А4"');
    expect(html).toContain('aria-label="Reject line 2: Маркери"');
    expect(html).toMatch(/>Approve</);
    expect(html).not.toContain("Partially approve");
  });

  // Повторне подання (задача 5): поточний користувач у моку — u1; автор заявки — її author_id.
  const EDIT_LINK = new RegExp(`<a[^>]*href="/requests/${ID}/edit"[^>]*>[\\s\\S]*?Edit[\\s\\S]*?</a>`);

  it("AC-DEC-07: автор поверненої заявки бачить посилання «Edit» на форму повторного подання", async () => {
    db.request = { ...db.request, author_id: "u1", status: "returned", return_reason: "Уточніть кількість" };
    const html = await render();
    expect(html).toMatch(EDIT_LINK);
  });

  it("«Edit» немає в заявки автора зі статусом не «returned» і в поверненої заявки іншого автора", async () => {
    for (const status of ["pending", "approved", "rejected", "partially_approved"]) {
      db.request = { ...db.request, author_id: "u1", status };
      expect(await render()).not.toContain(`/requests/${ID}/edit`);
    }
    db.request = { ...db.request, author_id: "u2", status: "returned", return_reason: "Уточніть кількість" };
    expect(await render()).not.toContain(`/requests/${ID}/edit`);
  });

  it("після повторного подання (?ok=RESUBMITTED) — «Purchase submitted» на сторінці заявки, без параметра — немає", async () => {
    db.request = { ...db.request, author_id: "u1", status: "pending" };
    const html = await render({ ok: "RESUBMITTED" });
    expect(html).toContain(messageFor("SUBMITTED"));
    expect(html).toContain("Purchase submitted");
    // Повідомлення — над заявкою, перед її відомостями.
    expect(html.indexOf("Purchase submitted")).toBeLessThan(html.indexOf('data-testid="purchase-status"'));
    expect(await render()).not.toContain("Purchase submitted");
  });

  // Дописав розробник за незалежним рев'ю задачі 5: «Тоді» AC-DEC-07 на рівні сторінки (база — tests/db/resubmit.test.ts).
  it("AC-DEC-07: після повторного подання автор бачить статус «Awaiting approval» і той самий відділ «Початкова школа»", async () => {
    db.request = { ...db.request, author_id: "u1", status: "pending", department_id: "d1" };
    const html = await render({ ok: "RESUBMITTED" });
    expect(html).toMatch(/data-testid="purchase-status"[^>]*>Awaiting approval</);
    expect(html).toMatch(/Department<\/dt><dd[^>]*>Початкова школа</);
    expect(html).not.toContain(`/requests/${ID}/edit`);
  });

  it("автор чи інший схвалювач (can_decide_purchase — ні) — без «Reject line» і кнопок рішення", async () => {
    db.canDecide = false;
    const html = await render();
    expect(html).not.toContain("Reject line");
    expect(html).not.toMatch(/>Approve</);
  });
});
