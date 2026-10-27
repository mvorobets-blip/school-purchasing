import { beforeEach, describe, expect, it, vi } from "vitest";

// Дія decidePurchase з підміненими next/navigation, getCurrentUser і supabase.rpc: шлях від дії до повідомлення
// (права в базі перевіряє tests/db/approval.test.ts).
const rpcResult = { error: null as null | { code?: string; message?: string } };
const rpcCalls: unknown[] = [];

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`);
  },
}));
vi.mock("@/lib/org/current-user", () => ({ getCurrentUser: async () => ({ id: "u1", role: "approver", isActive: true }) }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    rpc: async (...args: unknown[]) => {
      rpcCalls.push(args);
      return rpcResult;
    },
  }),
}));

const { decidePurchase } = await import("@/app/(portal)/approvals/actions");

const idle = { status: "idle" as const, message: "" };
const REQUEST = "22222222-2222-4222-8222-222222222222";
const form = (reason?: string) => {
  const fd = new FormData();
  if (reason !== undefined) fd.set("reason", reason);
  return fd;
};

describe("дія decidePurchase", () => {
  beforeEach(() => {
    rpcResult.error = null;
    rpcCalls.length = 0;
  });

  it("AC-APR-06: відхилення без причини — «Provide a reason», до бази не звертаємось", async () => {
    expect(await decidePurchase(REQUEST, "reject", idle, form("  "))).toEqual({ status: "error", message: "Provide a reason" });
    expect(rpcCalls).toHaveLength(0);
  });

  it("AC-LANG-05: відхилення без причини не збережено, схвалювач бачить англійське «Provide a reason»", async () => {
    const state = await decidePurchase(REQUEST, "reject", idle, form(""));
    expect(state).toEqual({ status: "error", message: "Provide a reason" });
    expect(state.message).not.toMatch(/[А-Яа-яІіЇїЄєҐґ]/);
  });

  it("AC-APR-07: відхилення з причиною передає причину в базу й повертає до списку", async () => {
    await expect(decidePurchase(REQUEST, "reject", idle, form("Немає бюджету"))).rejects.toThrow("REDIRECT /approvals?ok=REJECTED");
    expect(rpcCalls[0]).toEqual(["decide_purchase", { p_request_id: REQUEST, p_decision: "reject", p_reason: "Немає бюджету" }]);
  });

  it("AC-APR-03: відмову бази (чужий відділ) показано як «Not enough permissions»", async () => {
    rpcResult.error = { code: "42501", message: "FORBIDDEN" };
    expect(await decidePurchase(REQUEST, "approve", idle, form())).toEqual({ status: "error", message: "Not enough permissions" });
  });

  it("AC-APR-02: схвалення повертає до списку з повідомленням", async () => {
    await expect(decidePurchase(REQUEST, "approve", idle, form())).rejects.toThrow("REDIRECT /approvals?ok=APPROVED");
  });
});
