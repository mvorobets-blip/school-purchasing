import { beforeEach, describe, expect, it, vi } from "vitest";

// Дія submitPurchase з підміненими next/navigation, getCurrentUser і supabase.rpc: перевіряємо шлях від дії до
// повідомлення (права в базі перевіряє tests/db/purchase.test.ts).
const rpcResult = { error: null as null | { code?: string; message?: string } };
const rpcCalls: unknown[] = [];
const currentUser = { value: { id: "u1", role: "requester", isActive: true } as null | Record<string, unknown> };

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`);
  },
}));
vi.mock("@/lib/org/current-user", () => ({ getCurrentUser: async () => currentUser.value }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    rpc: async (...args: unknown[]) => {
      rpcCalls.push(args);
      return rpcResult;
    },
  }),
}));

const { submitPurchase } = await import("@/app/(portal)/requests/actions");

const idle = { status: "idle" as const, message: "", departmentId: "", purchaseType: "" };
const DEPT = "11111111-1111-4111-8111-111111111111";
const form = (lines: Record<string, string> = {}) => {
  const fd = new FormData();
  fd.set("departmentId", DEPT);
  fd.set("purchaseType", "purchasing_department");
  for (const [k, v] of Object.entries(lines)) fd.set(k, v);
  return fd;
};
const ONE_LINE = { "name.1": "Папір А4", "purpose.1": "Для друку", "quantity.1": "3", "price.1": "20.00" };

describe("дія submitPurchase", () => {
  beforeEach(() => {
    rpcResult.error = null;
    rpcCalls.length = 0;
    currentUser.value = { id: "u1", role: "requester", isActive: true };
  });

  it("AC-FRM-06: без рядків — «Add at least one line», відділ і тип лишаються, до бази не звертаємось", async () => {
    const state = await submitPurchase(idle, form());
    expect(state).toEqual({
      status: "error",
      message: "Add at least one line",
      departmentId: DEPT,
      purchaseType: "purchasing_department",
    });
    expect(rpcCalls).toHaveLength(0);
  });

  it("AC-LANG-04: заявку без рядків не подано, людина бачить англійське «Add at least one line»", async () => {
    const state = await submitPurchase(idle, form());
    expect(state.message).toBe("Add at least one line");
    expect(state.message).not.toMatch(/[А-Яа-яІіЇїЄєҐґ]/);
    expect(rpcCalls).toHaveLength(0);
  });

  it("AC-FRM-15: рядок лише з назвою — «Fill in all line fields», рядок іде в базу, відділ і тип лишаються", async () => {
    rpcResult.error = { code: "P0001", message: "INVALID_LINE" };
    const state = await submitPurchase(idle, form({ "name.1": "Папір А4" }));
    expect(state).toEqual({
      status: "error",
      message: "Fill in all line fields",
      departmentId: DEPT,
      purchaseType: "purchasing_department",
    });
    expect(rpcCalls).toHaveLength(1);
  });

  it("кількість 0 чи від'ємна ціна — рядок іде в базу, її відмова INVALID_LINE — «Fill in all line fields»", async () => {
    rpcResult.error = { code: "P0001", message: "INVALID_LINE" };
    const state = await submitPurchase(
      idle,
      form({ "name.1": "Папір А4", "purpose.1": "Для друку", "quantity.1": "0", "price.1": "-1" }),
    );
    expect(state.message).toBe("Fill in all line fields");
    expect(state.departmentId).toBe(DEPT);
    expect(rpcCalls).toHaveLength(1);
  });

  it("AC-FRM-11: після подання — «Мої заявки» з повідомленням «Закупівлю подано»", async () => {
    await expect(submitPurchase(idle, form(ONE_LINE))).rejects.toThrow("REDIRECT /requests?ok=SUBMITTED");
    expect(rpcCalls).toHaveLength(1);
  });

  it("AC-FRM-02: відмову бази (чужий відділ) показано як «Not enough permissions», без переходу", async () => {
    rpcResult.error = { code: "42501", message: "FORBIDDEN" };
    const state = await submitPurchase(idle, form(ONE_LINE));
    expect(state.message).toBe("Not enough permissions");
    expect(state.departmentId).toBe(DEPT);
  });

  it("гість чи неактивний користувач — відмова без запису", async () => {
    currentUser.value = null;
    const state = await submitPurchase(idle, form(ONE_LINE));
    expect(state.message).toBe("Not enough permissions");
    expect(rpcCalls).toHaveLength(0);
  });
});
