import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { messageFor } from "@/lib/org/messages";

// Сторінка «Мої заявки» (server component) з підміненими getCurrentUser і Supabase: що бачить працівник
// за порожнього й непорожнього списку. Права на рядки перевіряє tests/db/purchase.test.ts (RLS).
const data: { requests: Record<string, unknown>[] } = { requests: [] };

function query(table: string) {
  const rows = table === "purchase_requests" ? data.requests : [{ id: "d1", name: "Початкова школа" }];
  const builder = {
    select: () => builder,
    eq: () => builder,
    order: () => builder,
    then: (resolve: (v: unknown) => void) => resolve({ data: rows, error: null }),
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

const render = async () =>
  renderToStaticMarkup(await MyRequestsPage({ searchParams: Promise.resolve({}) } as never));

describe("сторінка «Мої заявки»", () => {
  beforeEach(() => {
    data.requests = [];
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
