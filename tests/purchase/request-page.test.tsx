import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { messageFor } from "@/lib/org/messages";

// Сторінка заявки (server component) з підміненими getCurrentUser і Supabase. Хто бачить заявку, вирішує RLS
// (tests/db/purchase.test.ts); тут — що показує сторінка за кожної відповіді бази.
const ID = "11111111-1111-4111-8111-111111111111";
const db: { request: Record<string, unknown> | null; linesError: boolean } = { request: null, linesError: false };

function query(table: string) {
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
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ from: query }) }));

const { default: RequestPage } = await import("@/app/(portal)/requests/[id]/page");

const render = async () =>
  renderToStaticMarkup(await RequestPage({ params: Promise.resolve({ id: ID }) } as never));

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
  });

  it("AC-FRM-08: заявки немає у відповіді бази (чужа) — «Недостатньо прав» без даних", async () => {
    db.request = null;
    const html = await render();
    expect(html).toContain(messageFor("FORBIDDEN"));
    expect(html).not.toContain("Папір А4");
  });

  it("рядки заявки показано таблицею", async () => {
    const html = await render();
    expect(html).toContain("Папір А4");
  });

  it("помилка завантаження рядків — повідомлення про помилку, а не порожня таблиця", async () => {
    db.linesError = true;
    const html = await render();
    expect(html).toContain('role="alert"');
    expect(html).not.toContain("<table");
    expect(html).not.toContain(messageFor("FORBIDDEN"));
  });
});
