import { beforeEach, describe, expect, it, vi } from "vitest";
import { messageFor } from "@/lib/org/messages";
import { withUser } from "../support/current-user";

// Дії членства з підміненими next/* і клієнтом Supabase: шлях від коду бази NOT_REQUESTER до тексту PM на сторінці
// відділу. Саму відмову бази (і «дані не змінились») доводить tests/db/org-roles.test.ts; тут — що людина бачить.
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
      { id: "admin-1", role: "admin", isActive: true },
      {
        rpc: async (...args: unknown[]) => {
          rpcCalls.push(args);
          return rpcResult;
        },
      },
    ),
}));

const { setApprover, setAutoApprove } = await import("@/app/(portal)/admin/departments/[id]/actions");

const HIGH = "33333333-3333-4333-8333-333333333333";
const EMPLOYEE = "44444444-4444-4444-8444-444444444444";
const form = () => {
  const fd = new FormData();
  fd.set("profileId", EMPLOYEE);
  return fd;
};
const NOT_REQUESTER = { code: "P0001", message: "NOT_REQUESTER" };
const TEXT = "Add the employee to the department as a requester first";

describe("дії членства: відмова «не заявник»", () => {
  beforeEach(() => {
    rpcResult.error = null;
    rpcCalls.length = 0;
  });

  it("AC-ORG-02: призначення схвалювачем «Вищої школи» не заявника — база відповідає NOT_REQUESTER, адміністратор бачить «Add the employee to the department as a requester first»", async () => {
    rpcResult.error = NOT_REQUESTER;
    await expect(setApprover(HIGH, true, form())).rejects.toThrow(`REDIRECT /admin/departments/${HIGH}?error=NOT_REQUESTER`);
    expect(rpcCalls).toEqual([["set_approver", { p_department_id: HIGH, p_profile_id: EMPLOYEE, p_value: true }]]);
    expect(messageFor("NOT_REQUESTER")).toBe(TEXT);
  });

  it("AC-ORG-33: увімкнення автосхвалення у «Вищій школі» не заявнику — база відповідає NOT_REQUESTER, адміністратор бачить «Add the employee to the department as a requester first»", async () => {
    rpcResult.error = NOT_REQUESTER;
    await expect(setAutoApprove(HIGH, true, form())).rejects.toThrow(`REDIRECT /admin/departments/${HIGH}?error=NOT_REQUESTER`);
    expect(rpcCalls).toEqual([["set_auto_approve", { p_department_id: HIGH, p_profile_id: EMPLOYEE, p_value: true }]]);
    expect(messageFor("NOT_REQUESTER")).toBe(TEXT);
  });

  it("успішне призначення — повідомлення про успіх, без коду помилки", async () => {
    await expect(setApprover(HIGH, true, form())).rejects.toThrow(`REDIRECT /admin/departments/${HIGH}?ok=APPROVER_SET`);
  });
});
