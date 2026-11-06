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
} = {
  request: null,
  lines: ONE_LINE,
  linesError: false,
  authorError: false,
  history: [],
};
const queried: string[] = [];
const rpcCalls: { fn: string; args: unknown }[] = [];
// Запис історії, який повертає request_history (AC-HIST-06): 19:32 UTC 5 листопада — 14:32 у Нью-Йорку (EST).
const SUBMITTED = { kind: "submitted", actor_name: "PM Demo Requester", created_at: "2026-11-05T19:32:00Z" };

// rpc за назвою функції: request_author_names — як раніше; request_history — записи історії.
async function rpc(fn: string, args: unknown) {
  rpcCalls.push({ fn, args });
  if (fn === "request_history") return { data: db.history, error: null };
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
    select: () => builder,
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
    queried.length = 0;
    rpcCalls.length = 0;
  });

  it("AC-FRM-08: заявки немає у відповіді бази (чужа) — «Недостатньо прав» без даних", async () => {
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
});
