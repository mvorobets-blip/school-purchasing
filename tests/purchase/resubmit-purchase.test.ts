import { beforeEach, describe, expect, it, vi } from "vitest";
import { type TestUser, withUser } from "../support/current-user";

// Дія resubmitPurchase (повторне подання поверненої заявки) з підміненими next/* і клієнтом Supabase: перевіряємо шлях
// від дії до rpc і повідомлення. Хто й що може подати знову, перевіряє база (tests/db/resubmit.test.ts).
const rpcResult = { error: null as null | { code?: string; message?: string } };
const rpcCalls: unknown[][] = [];
const currentUser = { value: { id: "u1", role: "requester", isActive: true } as TestUser | null };

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`);
  },
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () =>
    withUser(currentUser.value, {
      rpc: async (...args: unknown[]) => {
        rpcCalls.push(args);
        return rpcResult;
      },
    }),
}));

const { resubmitPurchase } = await import("@/app/(portal)/requests/actions");

const REQUEST_ID = "22222222-2222-4222-8222-222222222222";
const DEPT = "11111111-1111-4111-8111-111111111111";
const idle = { status: "idle" as const, message: "", departmentId: DEPT, purchaseType: "purchasing_department" };
const form = (lines: Record<string, string> = {}) => {
  const fd = new FormData();
  fd.set("departmentId", DEPT);
  fd.set("purchaseType", "purchasing_department");
  for (const [k, v] of Object.entries(lines)) fd.set(k, v);
  return fd;
};
// Три рядки поверненої заявки, у рядку 1 кількість виправлено з 3 на 5.
const FIXED_LINES = {
  "name.1": "Папір А4",
  "purpose.1": "Для друку",
  "quantity.1": "5",
  "price.1": "20.00",
  "name.2": "Маркери",
  "purpose.2": "Для дошки",
  "quantity.2": "2",
  "price.2": "15.50",
  "name.3": "Скріпки",
  "purpose.3": "Для офісу",
  "quantity.3": "5",
  "price.3": "1.00",
};

describe("дія resubmitPurchase", () => {
  beforeEach(() => {
    rpcResult.error = null;
    rpcCalls.length = 0;
    currentUser.value = { id: "u1", role: "requester", isActive: true };
  });

  it("AC-DEC-07: автор виправив рядок 1 і подав знову — rpc resubmit_purchase з усіма рядками, перехід на сторінку заявки з «RESUBMITTED»", async () => {
    await expect(resubmitPurchase(REQUEST_ID, idle, form(FIXED_LINES))).rejects.toThrow(
      `REDIRECT /requests/${REQUEST_ID}?ok=RESUBMITTED`,
    );
    expect(rpcCalls).toEqual([
      [
        "resubmit_purchase",
        {
          p_request_id: REQUEST_ID,
          p_lines: [
            { name: "Папір А4", purpose: "Для друку", quantity: "5", price: "20.00" },
            { name: "Маркери", purpose: "Для дошки", quantity: "2", price: "15.50" },
            { name: "Скріпки", purpose: "Для офісу", quantity: "5", price: "1.00" },
          ],
        },
      ],
    ]);
  });

  it("відділ і тип з форми в базу не передаються — повторне подання їх не змінює", async () => {
    await expect(resubmitPurchase(REQUEST_ID, idle, form(FIXED_LINES))).rejects.toThrow("REDIRECT");
    const args = rpcCalls[0]?.[1] as Record<string, unknown>;
    expect(Object.keys(args).sort()).toEqual(["p_lines", "p_request_id"]);
  });

  it("гість чи неактивний користувач — «Not enough permissions», до бази не звертаємось", async () => {
    currentUser.value = null;
    const state = await resubmitPurchase(REQUEST_ID, idle, form(FIXED_LINES));
    expect(state).toMatchObject({ status: "error", message: "Not enough permissions" });
    expect(rpcCalls).toHaveLength(0);
  });

  it("без рядків — «Add at least one line», відділ і тип лишаються, до бази не звертаємось", async () => {
    const state = await resubmitPurchase(REQUEST_ID, idle, form());
    expect(state).toEqual({
      status: "error",
      message: "Add at least one line",
      departmentId: DEPT,
      purchaseType: "purchasing_department",
    });
    expect(rpcCalls).toHaveLength(0);
  });

  it("назва довша за 200 символів — повідомлення про межу, до бази не звертаємось", async () => {
    const state = await resubmitPurchase(REQUEST_ID, idle, form({ ...FIXED_LINES, "name.1": "я".repeat(201) }));
    expect(state).toMatchObject({ status: "error", message: "Name and purpose can be up to 200 characters" });
    expect(rpcCalls).toHaveLength(0);
  });

  it("відмову бази FORBIDDEN (не автор чи заявка не повернена) показано як «Not enough permissions», без переходу", async () => {
    rpcResult.error = { code: "42501", message: "FORBIDDEN" };
    const state = await resubmitPurchase(REQUEST_ID, idle, form(FIXED_LINES));
    expect(state).toEqual({
      status: "error",
      message: "Not enough permissions",
      departmentId: DEPT,
      purchaseType: "purchasing_department",
    });
    expect(rpcCalls).toHaveLength(1);
  });

  it("відмови перевірки рядків — ті самі тексти, що при першому поданні", async () => {
    const cases: [string, string][] = [
      ["INVALID_LINE", "Fill in all line fields"],
      ["INVALID_QUANTITY", "Quantity: a whole number from 1"],
      ["INVALID_PRICE", "Price: a number from 0"],
    ];
    for (const [code, message] of cases) {
      rpcResult.error = { code: "P0001", message: code };
      const state = await resubmitPurchase(REQUEST_ID, idle, form({ ...FIXED_LINES, "quantity.1": "1.5" }));
      expect(state).toEqual({ status: "error", message, departmentId: DEPT, purchaseType: "purchasing_department" });
    }
    expect(rpcCalls).toHaveLength(cases.length);
  });
});
