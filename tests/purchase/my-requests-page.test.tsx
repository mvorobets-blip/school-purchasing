import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { messageFor } from "@/lib/org/messages";

// Сторінка «Мої заявки» (server component) з підміненими getCurrentUser і Supabase: що бачить працівник
// за порожнього й непорожнього списку. Права на рядки перевіряє tests/db/purchase.test.ts (RLS).
const data: { requests: Record<string, unknown>[]; total: number | null } = { requests: [], total: null };
const filters: string[] = [];

function query(table: string) {
  const rows = table === "purchase_requests" ? data.requests : [{ id: "d1", name: "Початкова школа" }];
  const builder = {
    select: () => builder,
    eq: (col: string, val: unknown) => (filters.push(`${table}.eq(${col},${String(val)})`), builder),
    order: () => builder,
    range: () => builder,
    then: (resolve: (v: unknown) => void) => resolve({ data: rows, count: data.total ?? (Array.isArray(rows) ? rows.length : null), error: null }),
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

const { default: MyRequestsPage } = await import("@/app/(portal)/requests/page");

const render = async (params: Record<string, string> = {}) =>
  renderToStaticMarkup(await MyRequestsPage({ searchParams: Promise.resolve(params) } as never));

describe("сторінка «Мої заявки»", () => {
  beforeEach(() => {
    data.requests = [];
    data.total = null;
    filters.length = 0;
  });

  it("AC-FRM-10: «Мої заявки» запитують лише заявки автора, що увійшов, і показують «Awaiting approval»", async () => {
    data.requests = [
      { id: "r1", department_id: "d1", purchase_type: "purchasing_department", status: "pending", created_at: "2026-10-26T10:00:00Z" },
    ];
    const html = await render();
    expect(filters).toContain("purchase_requests.eq(author_id,u1)");
    expect(html).toContain("Awaiting approval");
  });

  it("AC-FRM-11: після подання «Мої заявки» показують повідомлення «Purchase submitted» і нову заявку", async () => {
    data.requests = [
      { id: "r1", department_id: "d1", purchase_type: "purchasing_department", status: "pending", created_at: "2026-10-26T10:00:00Z" },
    ];
    const html = await render({ ok: "SUBMITTED" });
    expect(html).toMatch(/data-testid="purchase-message"[^>]*>Purchase submitted</);
    expect(html).toContain('data-testid="my-requests"');
  });

  it("AC-FRM-11: без ?ok=SUBMITTED (заявку не подавали) повідомлення «Purchase submitted» немає", async () => {
    const html = await render();
    expect(html).not.toContain("Purchase submitted");
  });

  it("AC-LANG-06: у списку статуси підписано текстом «Awaiting approval», «Approved», «Rejected»", async () => {
    data.requests = ["pending", "approved", "rejected"].map((status, i) => ({
      id: `r${i}`,
      department_id: "d1",
      purchase_type: "purchasing_department",
      status,
      created_at: "2026-10-26T10:00:00Z",
    }));
    const html = await render();
    const statuses = [...html.matchAll(/data-testid="purchase-status"[^>]*>([^<]+)</g)].map((m) => m[1]);
    expect(statuses).toEqual(["Awaiting approval", "Approved", "Rejected"]);
  });

  it("понад 50 заявок — сторінка 2 показує «Showing 51–60 of 60» і «Previous» на першу сторінку", async () => {
    data.requests = Array.from({ length: 10 }, (_, i) => ({
      id: `r${i}`,
      department_id: "d1",
      purchase_type: "purchasing_department",
      status: "pending",
      created_at: "2026-10-26T10:00:00Z",
    }));
    data.total = 60;
    const html = await render({ page: "2" });
    expect(html).toContain("Showing 51–60 of 60");
    expect(html).toContain('href="/requests?page=1"');
    expect(html).not.toContain('href="/requests?page=3"');
  });

  it("сторінка за межами — перенаправлення на останню", async () => {
    data.total = 60;
    await expect(render({ page: "9" })).rejects.toThrow("REDIRECT /requests?page=2");
  });

  it("до 50 заявок — без навігації сторінками", async () => {
    data.requests = [{ id: "r1", department_id: "d1", purchase_type: "purchasing_department", status: "pending", created_at: "2026-10-26T10:00:00Z" }];
    const html = await render();
    expect(html).not.toContain('data-testid="pagination"');
  });

  it("AC-FRM-14: без заявок — порожній стан з текстом PM і без таблиці", async () => {
    const html = await render();
    expect(html).toContain(messageFor("NO_REQUESTS"));
    expect(html).toContain('data-testid="no-requests"');
    expect(html).not.toContain('data-testid="my-requests"');
  });

  it("з поданою заявкою — таблиця зі статусом, порожнього стану немає", async () => {
    data.requests = [
      { id: "r1", department_id: "d1", purchase_type: "purchasing_department", status: "pending", created_at: "2026-10-26T10:00:00Z" },
    ];
    const html = await render();
    expect(html).toContain('data-testid="my-requests"');
    expect(html).toContain('data-testid="purchase-status"');
    expect(html).not.toContain(messageFor("NO_REQUESTS"));
  });
});
