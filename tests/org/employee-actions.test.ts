import { beforeEach, describe, expect, it, vi } from "vitest";
import { approverCandidates } from "@/lib/org/employees";
import { messageFor } from "@/lib/org/messages";
import { withUser } from "../support/current-user";

// Дії сторінки працівника з підміненими next/* і клієнтом Supabase: шлях від коду бази LAST_ADMIN до тексту PM.
// Саму відмову бази (і «дані не змінились») доводить tests/db/employee-deactivation.test.ts; тут — що людина бачить.
const rpcResult = { error: null as null | { code?: string; message?: string } };
const rpcCalls: unknown[] = [];
// Виклики from("employee_permissions"): upsert / delete з аргументами — для дії setPermission.
const tableCalls: unknown[] = [];
function permissionsTable(table: string) {
  const filters: unknown[] = [];
  const deleting = {
    eq: (col: string, val: unknown) => {
      filters.push([col, val]);
      return deleting;
    },
    then: (resolve: (v: unknown) => void) => {
      tableCalls.push([table, "delete", filters]);
      resolve(rpcResult);
    },
  };
  return {
    upsert: async (row: unknown, opts: unknown) => {
      tableCalls.push([table, "upsert", row, opts]);
      return rpcResult;
    },
    delete: () => deleting,
  };
}
let actor = { id: "a0000000-0000-4000-8000-000000000001", role: "admin", isActive: true };

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`);
  },
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () =>
    withUser(actor, {
      rpc: async (...args: unknown[]) => {
        rpcCalls.push(args);
        return rpcResult;
      },
      from: permissionsTable,
    }),
}));

const { removeAdminRole, setEmployeeActive, setPermission } = await import("@/app/(portal)/admin/employees/[id]/actions");

const SELF = "a0000000-0000-4000-8000-000000000001";
const EMPLOYEE = "44444444-4444-4444-8444-444444444444";
const LAST_ADMIN = { code: "P0001", message: "LAST_ADMIN" };
const TEXT = "At least one active administrator must remain";

describe("дії сторінки працівника", () => {
  beforeEach(() => {
    rpcResult.error = null;
    rpcCalls.length = 0;
    tableCalls.length = 0;
    actor = { id: SELF, role: "admin", isActive: true };
  });

  it("AC-ORG-10: єдиний адміністратор знімає з себе роль — база відповідає LAST_ADMIN, він бачить «At least one active administrator must remain»", async () => {
    rpcResult.error = LAST_ADMIN;
    await expect(removeAdminRole(SELF)).rejects.toThrow(`REDIRECT /admin/employees/${SELF}?error=LAST_ADMIN`);
    expect(rpcCalls).toEqual([["remove_admin_role", { p_profile_id: SELF }]]);
    expect(messageFor("LAST_ADMIN")).toBe(TEXT);
  });

  it("AC-ORG-18: єдиний адміністратор деактивує себе — база відповідає LAST_ADMIN, він бачить «At least one active administrator must remain»", async () => {
    rpcResult.error = LAST_ADMIN;
    await expect(setEmployeeActive(SELF, false)).rejects.toThrow(`REDIRECT /admin/employees/${SELF}?error=LAST_ADMIN`);
    expect(rpcCalls).toEqual([["set_active", { p_profile_id: SELF, p_active: false }]]);
  });

  it("AC-ORG-12: деактивація працівника — RPC set_active(false) і повідомлення про успіх", async () => {
    await expect(setEmployeeActive(EMPLOYEE, false)).rejects.toThrow(
      `REDIRECT /admin/employees/${EMPLOYEE}?ok=DEACTIVATED`,
    );
    expect(rpcCalls).toEqual([["set_active", { p_profile_id: EMPLOYEE, p_active: false }]]);
  });

  it("AC-ORG-30: повторна активація — RPC set_active(true) і повідомлення про успіх", async () => {
    await expect(setEmployeeActive(EMPLOYEE, true)).rejects.toThrow(`REDIRECT /admin/employees/${EMPLOYEE}?ok=ACTIVATED`);
  });

  it("не-адміністратор, викликавши дію напряму, отримує «Not enough permissions», RPC не викликано", async () => {
    actor = { id: SELF, role: "requester", isActive: true };
    await expect(setEmployeeActive(EMPLOYEE, false)).rejects.toThrow(
      `REDIRECT /admin/employees/${EMPLOYEE}?error=FORBIDDEN`,
    );
    expect(rpcCalls).toEqual([]);
  });

  it("value не boolean (виклик дії напряму) — помилка без RPC", async () => {
    await expect(setEmployeeActive(EMPLOYEE, "false" as never)).rejects.toThrow(
      `REDIRECT /admin/employees/${EMPLOYEE}?error=UNKNOWN`,
    );
    expect(rpcCalls).toEqual([]);
  });

  it("невалідний id — назад до списку, RPC не викликано", async () => {
    await expect(removeAdminRole("not-a-uuid")).rejects.toThrow("REDIRECT /admin/employees");
    expect(rpcCalls).toEqual([]);
  });
});

describe("дія setPermission", () => {
  beforeEach(() => {
    rpcResult.error = null;
    tableCalls.length = 0;
    actor = { id: SELF, role: "admin", isActive: true };
  });

  it("AC-ORG-17: видача дозволу на «Витрату карткою» — upsert з ignoreDuplicates (ON CONFLICT DO NOTHING, досить права INSERT)", async () => {
    await expect(setPermission(EMPLOYEE, "card_expense", true)).rejects.toThrow(
      `REDIRECT /admin/employees/${EMPLOYEE}?ok=PERMISSION_GRANTED`,
    );
    expect(tableCalls).toEqual([
      [
        "employee_permissions",
        "upsert",
        { profile_id: EMPLOYEE, permission: "card_expense" },
        { onConflict: "profile_id,permission", ignoreDuplicates: true },
      ],
    ]);
  });

  it("AC-ORG-26: зняття дозволу — delete саме цього дозволу цього працівника", async () => {
    await expect(setPermission(EMPLOYEE, "card_expense", false)).rejects.toThrow(
      `REDIRECT /admin/employees/${EMPLOYEE}?ok=PERMISSION_REVOKED`,
    );
    expect(tableCalls).toEqual([
      ["employee_permissions", "delete", [["profile_id", EMPLOYEE], ["permission", "card_expense"]]],
    ]);
  });

  it("value не boolean (напр. рядок \"false\") — помилка без запису, а не видача дозволу", async () => {
    await expect(setPermission(EMPLOYEE, "card_expense", "false" as never)).rejects.toThrow(
      `REDIRECT /admin/employees/${EMPLOYEE}?error=UNKNOWN`,
    );
    expect(tableCalls).toEqual([]);
  });

  it("відмова RLS (42501) — «Not enough permissions»", async () => {
    rpcResult.error = { code: "42501", message: "new row violates row-level security policy" };
    await expect(setPermission(EMPLOYEE, "self_purchase", true)).rejects.toThrow(
      `REDIRECT /admin/employees/${EMPLOYEE}?error=FORBIDDEN`,
    );
  });

  it("невідомий дозвіл — помилка без запису; не-адміністратор — FORBIDDEN раніше за перевірку дозволу", async () => {
    await expect(setPermission(EMPLOYEE, "fly_to_moon" as never, true)).rejects.toThrow(
      `REDIRECT /admin/employees/${EMPLOYEE}?error=UNKNOWN`,
    );
    actor = { id: SELF, role: "requester", isActive: true };
    await expect(setPermission(EMPLOYEE, "fly_to_moon" as never, true)).rejects.toThrow(
      `REDIRECT /admin/employees/${EMPLOYEE}?error=FORBIDDEN`,
    );
    expect(tableCalls).toEqual([]);
  });
});

describe("варіанти вибору на сторінці відділу", () => {
  it("approverCandidates: деактивованого працівника немає серед варіантів (саме правило доводить тест бази)", () => {
    const people = [
      { id: "1", email: "active@example.test", is_active: true },
      { id: "2", email: "left@example.test", is_active: false },
    ];
    expect(approverCandidates(people).map((p) => p.email)).toEqual(["active@example.test"]);
  });
});
