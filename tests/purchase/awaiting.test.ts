import { beforeEach, describe, expect, it, vi } from "vitest";

// getAwaitingDecision з підміненим Supabase: які саме запити й фільтри він будує. Що ці фільтри під RLS дають список
// AC-APR-01 (лише заявки своїх відділів, «pending», без власних), перевіряє tests/db/approval.test.ts тими самими запитами.
const calls: string[] = [];
const data: { approverOf: { department_id: string }[] } = { approverOf: [] };

function query(table: string) {
  const rows = table === "department_members" ? data.approverOf : [{ id: "r1", department_id: "d1" }];
  const builder = {
    select: (cols: string) => (calls.push(`${table}.select(${cols})`), builder),
    eq: (col: string, val: unknown) => (calls.push(`${table}.eq(${col},${String(val)})`), builder),
    neq: (col: string, val: unknown) => (calls.push(`${table}.neq(${col},${String(val)})`), builder),
    in: (col: string, vals: unknown[]) => (calls.push(`${table}.in(${col},${vals.join("|")})`), builder),
    order: (col: string) => (calls.push(`${table}.order(${col})`), builder),
    range: (from: number, to: number) => (calls.push(`${table}.range(${from},${to})`), builder),
    then: (resolve: (v: unknown) => void) => resolve({ data: rows, count: Array.isArray(rows) ? rows.length : null, error: null }),
  };
  return builder;
}

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ from: query }) }));
const { getAwaitingDecision } = await import("@/lib/purchase/awaiting");

describe("getAwaitingDecision", () => {
  beforeEach(() => {
    calls.length = 0;
    data.approverOf = [];
  });

  it("AC-APR-01: список для рішення — заявки відділів, де людина схвалювач, лише «pending», без власних", async () => {
    data.approverOf = [{ department_id: "d1" }, { department_id: "d2" }];
    const result = await getAwaitingDecision("u1");
    expect(calls).toEqual([
      "department_members.select(department_id)",
      "department_members.eq(profile_id,u1)",
      "department_members.eq(is_approver,true)",
      "purchase_requests.select(id, department_id, purchase_type, created_at)",
      "purchase_requests.in(department_id,d1|d2)",
      "purchase_requests.eq(status,pending)",
      "purchase_requests.neq(author_id,u1)",
      "purchase_requests.order(created_at)",
      "purchase_requests.range(0,49)",
    ]);
    expect(result).toMatchObject({ departmentIds: ["d1", "d2"], failed: false });
  });

  it("не схвалювач жодного відділу — заявки не запитуються", async () => {
    const result = await getAwaitingDecision("u2");
    expect(calls.some((c) => c.startsWith("purchase_requests"))).toBe(false);
    expect(result).toEqual({ departmentIds: [], requests: [], total: 0, failed: false });
  });
});
