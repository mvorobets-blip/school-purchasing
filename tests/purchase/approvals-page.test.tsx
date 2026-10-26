import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { messageFor } from "@/lib/org/messages";

// Сторінка «Awaiting decision» (server component) з підміненими getCurrentUser і Supabase: що бачить людина без
// відділів для схвалення і схвалювач. Хто що бачить у базі, перевіряє tests/db/approval.test.ts (RLS, функції).
const data: { approverOf: { department_id: string }[]; requests: Record<string, unknown>[] } = {
  approverOf: [],
  requests: [],
};
const queried: string[] = [];

function query(table: string) {
  queried.push(table);
  const rows =
    table === "department_members"
      ? data.approverOf
      : table === "purchase_requests"
        ? data.requests
        : [{ id: "d1", name: "Початкова школа" }];
  const builder = {
    select: () => builder,
    eq: () => builder,
    neq: () => builder,
    in: () => builder,
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
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: query,
    rpc: async () => ({ data: [{ request_id: "r1", author_name: "Андрій Демо-Перший" }], error: null }),
  }),
}));

const { default: ApprovalsPage } = await import("@/app/(portal)/approvals/page");

const render = async () => renderToStaticMarkup(await ApprovalsPage({ searchParams: Promise.resolve({}) } as never));

describe("сторінка «Awaiting decision»", () => {
  beforeEach(() => {
    data.approverOf = [];
    data.requests = [];
    queried.length = 0;
  });

  it("AC-APR-04: людина без відділів для схвалення бачить «Not enough permissions», заявки не запитуються", async () => {
    const html = await render();
    expect(html).toContain(messageFor("FORBIDDEN"));
    expect(html).not.toContain('data-testid="decision-list"');
    expect(queried).not.toContain("purchase_requests");
  });

  it("схвалювач бачить заявки свого відділу з автором і кнопками рішення", async () => {
    data.approverOf = [{ department_id: "d1" }];
    data.requests = [
      { id: "r1", department_id: "d1", purchase_type: "purchasing_department", status: "pending", created_at: "2026-10-26T10:00:00Z" },
    ];
    const html = await render();
    expect(html).toContain('data-testid="decision-list"');
    expect(html).toContain("Андрій Демо-Перший");
    expect(html).toContain("Approve");
    expect(html).not.toContain(messageFor("FORBIDDEN"));
  });
});
