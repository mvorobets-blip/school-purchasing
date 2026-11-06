import { beforeEach, describe, expect, it, vi } from "vitest";
import { withUser } from "../support/current-user";

// Дія decidePurchase з підміненими next/navigation і клієнтом Supabase (сесія, профіль, rpc): шлях від дії до повідомлення
// (права в базі перевіряє tests/db/approval.test.ts).
const rpcResult = { error: null as null | { code?: string; message?: string } };
const rpcCalls: unknown[] = [];

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`);
  },
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () =>
    withUser(
      { id: "u1", role: "approver", isActive: true },
      {
        rpc: async (...args: unknown[]) => {
          rpcCalls.push(args);
          return rpcResult;
        },
      },
    ),
}));

const { decidePurchase } = await import("@/app/(portal)/approvals/actions");

const idle = { status: "idle" as const, message: "" };
const REQUEST = "22222222-2222-4222-8222-222222222222";
const form = (reason?: string, rejectLines: string[] = []) => {
  const fd = new FormData();
  if (reason !== undefined) fd.set("reason", reason);
  // Позначені прапорці «Reject line» — кілька полів з однаковою назвою rejectLine (значення — позиція рядка).
  for (const position of rejectLines) fd.append("rejectLine", position);
  return fd;
};
// Аргументи rpc без позначених рядків: p_rejected_positions за контрактом задачі 3 — або [], або не передано (default '{}').
const rpcArgs = (call: unknown) => {
  const [fn, args] = call as [string, Record<string, unknown>];
  const { p_rejected_positions = [], ...rest } = args;
  return { fn, args: rest, positions: p_rejected_positions };
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
    expect(rpcArgs(rpcCalls[0])).toEqual({
      fn: "decide_purchase",
      args: { p_request_id: REQUEST, p_decision: "reject", p_reason: "Немає бюджету" },
      positions: [],
    });
  });

  it("AC-APR-03: відмову бази (чужий відділ) показано як «Not enough permissions»", async () => {
    rpcResult.error = { code: "42501", message: "FORBIDDEN" };
    expect(await decidePurchase(REQUEST, "approve", idle, form())).toEqual({ status: "error", message: "Not enough permissions" });
  });

  it("AC-APR-02: схвалення повертає до списку з повідомленням", async () => {
    await expect(decidePurchase(REQUEST, "approve", idle, form())).rejects.toThrow("REDIRECT /approvals?ok=APPROVED");
  });

  it("AC-APR-02: схвалення без позначених рядків — у базу йде порожній список відхилених, повідомлення «APPROVED»", async () => {
    await expect(decidePurchase(REQUEST, "approve", idle, form())).rejects.toThrow("REDIRECT /approvals?ok=APPROVED");
    expect(rpcArgs(rpcCalls[0])).toEqual({
      fn: "decide_purchase",
      args: { p_request_id: REQUEST, p_decision: "approve", p_reason: null },
      positions: [],
    });
  });

  it("AC-DEC-01: позначено рядок 2 — дія передає p_rejected_positions [2] і повертає до списку з «PARTIALLY_APPROVED»", async () => {
    await expect(decidePurchase(REQUEST, "approve", idle, form(undefined, ["2"]))).rejects.toThrow(
      "REDIRECT /approvals?ok=PARTIALLY_APPROVED",
    );
    expect(rpcCalls).toEqual([
      [
        "decide_purchase",
        { p_request_id: REQUEST, p_decision: "approve", p_reason: null, p_rejected_positions: [2] },
      ],
    ]);
  });

  it("неможливе значення rejectLine (не ціле число від 1) — рішення не надіслано, «The request has changed. Refresh the page.»", async () => {
    for (const bad of [["abc"], ["0"], ["1.5"], ["2", "-1"], ["2147483648"]]) {
      const state = await decidePurchase(REQUEST, "approve", idle, form(undefined, bad));
      expect(state).toEqual({ status: "error", message: "The request has changed. Refresh the page." });
    }
    expect(rpcCalls).toHaveLength(0);
  });

  // Рев'ю CodeRabbit (PR 60): відповіді бази про змінену заявку — той самий текст, що для підробленої форми.
  it("база відповіла INVALID_LINE чи INVALID_DECISION — «The request has changed. Refresh the page.»", async () => {
    for (const message of ["INVALID_LINE", "INVALID_DECISION"]) {
      rpcResult.error = { code: "P0001", message };
      const state = await decidePurchase(REQUEST, "approve", idle, form(undefined, ["2"]));
      expect(state).toEqual({ status: "error", message: "The request has changed. Refresh the page." });
    }
  });

  it("кілька позначених рядків передано числами в порядку форми", async () => {
    await expect(decidePurchase(REQUEST, "approve", idle, form(undefined, ["1", "3"]))).rejects.toThrow(
      "REDIRECT /approvals?ok=PARTIALLY_APPROVED",
    );
    expect(rpcArgs(rpcCalls[0]).positions).toEqual([1, 3]);
  });

  it("усі рядки позначено — відповідь бази ALL_LINES_REJECTED показано як «All lines are rejected: reject the whole request»", async () => {
    rpcResult.error = { code: "P0001", message: "ALL_LINES_REJECTED" };
    expect(await decidePurchase(REQUEST, "approve", idle, form(undefined, ["1", "2", "3"]))).toEqual({
      status: "error",
      message: "All lines are rejected: reject the whole request",
    });
    expect(rpcArgs(rpcCalls[0]).positions).toEqual([1, 2, 3]);
  });

  it("причина довша за 500 символів — зрозуміле повідомлення, до бази не звертаємось", async () => {
    expect(await decidePurchase(REQUEST, "reject", idle, form("я".repeat(501)))).toEqual({
      status: "error",
      message: "The reason can be up to 500 characters",
    });
    expect(rpcCalls).toHaveLength(0);
  });

  it("причина рівно з 500 символів іде в базу без змін", async () => {
    const reason = "я".repeat(500);
    await expect(decidePurchase(REQUEST, "reject", idle, form(reason))).rejects.toThrow("REDIRECT /approvals?ok=REJECTED");
    expect(rpcCalls).toHaveLength(1);
    expect(rpcArgs(rpcCalls[0])).toEqual({
      fn: "decide_purchase",
      args: { p_request_id: REQUEST, p_decision: "reject", p_reason: reason },
      positions: [],
    });
  });

  // Повернення на доопрацювання (задача 4): те саме decidePurchase з рішенням "return" і полем форми reason.
  it("AC-DEC-06: повернення без причини — «Provide a reason», до бази не звертаємось", async () => {
    for (const reason of [undefined, "", "   "]) {
      expect(await decidePurchase(REQUEST, "return", idle, form(reason))).toEqual({ status: "error", message: "Provide a reason" });
    }
    expect(rpcCalls).toHaveLength(0);
  });

  it("AC-DEC-04: повернення з причиною «Уточніть кількість» — rpc з рішенням return і причиною, назад до списку з «RETURNED»", async () => {
    await expect(decidePurchase(REQUEST, "return", idle, form("  Уточніть кількість  "))).rejects.toThrow(
      "REDIRECT /approvals?ok=RETURNED",
    );
    expect(rpcCalls).toEqual([
      [
        "decide_purchase",
        { p_request_id: REQUEST, p_decision: "return", p_reason: "Уточніть кількість", p_rejected_positions: [] },
      ],
    ]);
  });

  it("повернення з причиною довшою за 500 символів — «The reason can be up to 500 characters», до бази не звертаємось", async () => {
    expect(await decidePurchase(REQUEST, "return", idle, form("я".repeat(501)))).toEqual({
      status: "error",
      message: "The reason can be up to 500 characters",
    });
    expect(rpcCalls).toHaveLength(0);
  });

  it("повернення: відповідь бази NO_REASON показано як «Provide a reason»", async () => {
    rpcResult.error = { code: "P0001", message: "NO_REASON" };
    expect(await decidePurchase(REQUEST, "return", idle, form("Уточніть кількість"))).toEqual({
      status: "error",
      message: "Provide a reason",
    });
  });

  it("повернення: позначені «Reject line» до бази не йдуть — p_rejected_positions порожній", async () => {
    await expect(decidePurchase(REQUEST, "return", idle, form("Уточніть кількість", ["2"]))).rejects.toThrow(
      "REDIRECT /approvals?ok=RETURNED",
    );
    expect(rpcArgs(rpcCalls[0]).positions).toEqual([]);
  });

  it("відмову check-обмеження довжини причини в базі показано тим самим повідомленням", async () => {
    rpcResult.error = {
      code: "23514",
      message: 'new row for relation "purchase_requests" violates check constraint "purchase_requests_reject_reason_length"',
    };
    expect((await decidePurchase(REQUEST, "reject", idle, form("Немає бюджету"))).message).toBe("The reason can be up to 500 characters");
  });
});
