import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { withUser } from "../support/current-user";

// Головна (server component) з підміненим клієнтом Supabase: рядки власних заявок, їхні статуси й причини і помилки
// запитів позицій та причин. Регресійні тести без AC ID (рев'ю CodeRabbit, PR 61).
const ID = "11111111-1111-4111-8111-111111111111";
const OWN = { id: ID, department_id: "d1", purchase_type: "purchasing_department", status: "pending", created_at: "2026-11-05T19:32:00Z" };
const db: {
  own: Record<string, unknown>[];
  fresh: Record<string, unknown>[];
  linesError: boolean;
  reasonsError: boolean;
} = { own: [], fresh: [], linesError: false, reasonsError: false };

const BOOM = { data: null, error: { message: "boom" } };

function query(table: string) {
  let columns = "";
  const filters: Record<string, unknown> = {};
  const result = () => {
    if (table === "departments") return { data: [{ id: "d1", name: "Початкова школа" }], error: null };
    if (table === "department_members") {
      // getAwaitingDecision: людина не схвалює жодного відділу; головна: людина — заявник відділу d1.
      if (filters.is_approver === true) return { data: [], error: null };
      return { data: [{ department_id: "d1", profile_id: "u1", is_approver: false }], error: null };
    }
    if (table === "employee_permissions") return { data: [], error: null };
    if (table === "purchase_request_lines") {
      return db.linesError ? BOOM : { data: [{ request_id: ID, position: 1, name: "Папір А4" }], error: null };
    }
    if (table === "purchase_requests") {
      // select("*") — запит причин показаних заявок; інший — список власних заявок (без причин).
      if (columns === "*") return db.reasonsError ? BOOM : { data: db.fresh, error: null };
      return { data: db.own, error: null };
    }
    return { data: [], error: null };
  };
  const builder: Record<string, unknown> = {
    select: (c: string) => {
      columns = c;
      return builder;
    },
    eq: (column: string, value: unknown) => {
      filters[column] = value;
      return builder;
    },
    in: () => builder,
    order: () => builder,
    range: () => builder,
    limit: () => builder,
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
  createClient: async () => withUser({ id: "u1", role: "requester", isActive: true }, { from: query }),
}));

const { default: Home } = await import("@/app/(portal)/page");
const render = async () => renderToStaticMarkup(await Home());

describe("головна: останні власні заявки", () => {
  beforeEach(() => {
    db.own = [OWN];
    db.fresh = [{ ...OWN, reject_reason: null, return_reason: null }];
    db.linesError = false;
    db.reasonsError = false;
  });

  it("заявку повернули між запитами — рядок показує статус і причину з одного запиту", async () => {
    db.fresh = [{ ...OWN, status: "returned", reject_reason: null, return_reason: "Уточніть кількість" }];
    const html = await render();
    expect(html).toContain("Папір А4");
    expect(html).toMatch(/data-testid="purchase-status"[^>]*>Returned for revision</);
    expect(html).toContain("Уточніть кількість");
  });

  it("помилка запиту причин — «Could not load data. Refresh the page.», без рядків", async () => {
    db.reasonsError = true;
    const html = await render();
    expect(html).toContain("Could not load data. Refresh the page.");
    expect(html).not.toContain("Папір А4");
  });

  it("помилка запиту позицій — «Could not load data. Refresh the page.», а не «Purchase» замість назви", async () => {
    db.linesError = true;
    const html = await render();
    expect(html).toContain("Could not load data. Refresh the page.");
    expect(html).not.toContain(">Purchase<");
  });
});
