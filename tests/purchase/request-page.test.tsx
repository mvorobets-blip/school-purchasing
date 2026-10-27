import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { messageFor } from "@/lib/org/messages";

// Сторінка заявки (server component) з підміненими getCurrentUser і Supabase. Хто бачить заявку, вирішує RLS
// (tests/db/purchase.test.ts); тут — що показує сторінка за кожної відповіді бази.
const ID = "11111111-1111-4111-8111-111111111111";
const db: { request: Record<string, unknown> | null; linesError: boolean; authorError: boolean } = {
  request: null,
  linesError: false,
  authorError: false,
};
const queried: string[] = [];

function query(table: string) {
  queried.push(table);
  const result = () => {
    if (table === "purchase_requests") return { data: db.request, error: null };
    if (table === "purchase_request_lines") {
      return db.linesError
        ? { data: null, error: { message: "boom" } }
        : { data: [{ position: 1, name: "Папір А4", purpose: "Друк", quantity: 3, price: 20 }], error: null };
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
vi.mock("@/lib/org/current-user", () => ({
  getCurrentUser: async () => ({ id: "u1", role: "requester", isActive: true }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: query,
    rpc: async () =>
      db.authorError
        ? { data: null, error: { message: "boom" } }
        : { data: db.request ? [{ request_id: ID, author_name: "Андрій Демо-Перший" }] : [], error: null },
  }),
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
      department_id: "d1",
      purchase_type: "purchasing_department",
      status: "pending",
      reject_reason: null,
      created_at: "2026-10-26T10:00:00Z",
    };
    db.linesError = false;
    db.authorError = false;
    queried.length = 0;
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
});
