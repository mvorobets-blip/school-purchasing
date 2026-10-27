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
let authorError = false;
const filters: string[] = [];

function query(table: string) {
  queried.push(table);
  const rows =
    table === "department_members"
      ? data.approverOf
      : table === "purchase_requests"
        ? data.requests
        : [{ id: "d1", name: "Початкова школа" }];
  // Як PostgREST: select(…, { head: true }) — лише кількість; .range(from, to) — зріз рядків; count — уся кількість.
  let data_: Record<string, unknown>[] | null = rows;
  const builder = {
    select: (_cols?: string, opts?: { head?: boolean }) => {
      if (opts?.head) data_ = null;
      return builder;
    },
    eq: (col: string, val: unknown) => (filters.push(`${table}.eq(${col},${String(val)})`), builder),
    neq: (col: string, val: unknown) => (filters.push(`${table}.neq(${col},${String(val)})`), builder),
    in: (col: string, vals: unknown[]) => (filters.push(`${table}.in(${col},${vals.join("|")})`), builder),
    order: () => builder,
    range: (from: number, to: number) => {
      filters.push(`${table}.range(${from},${to})`);
      data_ = rows.slice(from, to + 1);
      return builder;
    },
    then: (resolve: (v: unknown) => void) => resolve({ data: data_, count: rows.length, error: null }),
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
      authorError
        ? { data: null, error: { message: "boom" } }
        : { data: [{ request_id: "r1", author_name: "Андрій Демо-Перший" }], error: null },
  }),
}));

const { default: ApprovalsPage } = await import("@/app/(portal)/approvals/page");

const render = async (params: Record<string, string> = {}) =>
  renderToStaticMarkup(await ApprovalsPage({ searchParams: Promise.resolve(params) } as never));

describe("сторінка «Awaiting decision»", () => {
  beforeEach(() => {
    data.approverOf = [];
    data.requests = [];
    queried.length = 0;
    filters.length = 0;
    authorError = false;
  });

  it("помилка запиту авторів — повідомлення про помилку, а не «—» у стовпці «Author»", async () => {
    data.approverOf = [{ department_id: "d1" }];
    data.requests = [
      { id: "r1", department_id: "d1", purchase_type: "purchasing_department", status: "pending", created_at: "2026-10-26T10:00:00Z" },
    ];
    authorError = true;
    const html = await render();
    expect(html).toContain("Could not load requests. Refresh the page.");
    expect(html).not.toContain('data-testid="decision-list"');
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
    // Список для рішення: лише відділи, які схвалює людина, лише «Очікує схвалення», без власних заявок (AC-APR-01, 05).
    expect(filters).toEqual(
      expect.arrayContaining([
        "purchase_requests.in(department_id,d1)",
        "purchase_requests.eq(status,pending)",
        "purchase_requests.neq(author_id,u1)",
      ]),
    );
  });

  it("AC-APR-08: у списку для рішення стовпець «Author» з ім'ям автора кожної заявки", async () => {
    data.approverOf = [{ department_id: "d1" }];
    data.requests = [
      { id: "r1", department_id: "d1", purchase_type: "purchasing_department", status: "pending", created_at: "2026-10-26T10:00:00Z" },
    ];
    const html = await render();
    expect(html).toContain(">Author</th>");
    expect(html).toMatch(/data-testid="decision-author"[^>]*>Андрій Демо-Перший</);
    // Сторінка заявки зі списку повертає «← Назад» сюди, а не в «My requests».
    expect(html).toContain('href="/requests/r1?from=approvals"');
  });

  it("AC-APR-10: список для рішення не читає профілю й дозволів автора — лише ім'я з request_author_names", async () => {
    data.approverOf = [{ department_id: "d1" }];
    data.requests = [
      { id: "r1", department_id: "d1", purchase_type: "purchasing_department", status: "pending", created_at: "2026-10-26T10:00:00Z" },
    ];
    await render();
    expect(queried).not.toContain("profiles");
    expect(queried).not.toContain("employee_permissions");
    // department_members читаємо лише для самого схвалювача (його відділи), не для автора.
    expect(filters.filter((f) => f.startsWith("department_members."))).toEqual([
      "department_members.eq(profile_id,u1)",
      "department_members.eq(is_approver,true)",
    ]);
  });

  const many = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      id: `r${i + 1}`,
      department_id: "d1",
      purchase_type: "purchasing_department",
      status: "pending",
      created_at: "2026-10-26T10:00:00Z",
    }));

  it("сторінка 2 бере .range(50, 99) і показує «Showing 51–51 of 51» з «Previous»", async () => {
    data.approverOf = [{ department_id: "d1" }];
    data.requests = many(51);
    const html = await render({ page: "2" });
    expect(filters).toContain("purchase_requests.range(50,99)");
    expect(html.match(/data-testid="decision-author"/g)).toHaveLength(1);
    expect(html).toContain("Showing 51–51 of 51");
    expect(html).toContain('href="/approvals?page=1"');
  });

  it("сторінка за межами — перенаправлення на останню, рядки не запитуються", async () => {
    data.approverOf = [{ department_id: "d1" }];
    data.requests = many(51);
    await expect(render({ page: "9" })).rejects.toThrow("REDIRECT /approvals?page=2");
    expect(filters.some((f) => f.includes(".range("))).toBe(false);
  });
});
