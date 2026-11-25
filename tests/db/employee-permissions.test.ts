// Тести бази (PGlite) для задачі 5.1: видача й зняття дозволів у employee_permissions під політиками
// employee_permissions_insert_admin / _delete_admin / _select_own_or_admin (міграція 20261021213618) — так само, як їх
// виконує дія setPermission (insert … on conflict do nothing / delete від імені користувача).
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "./supabase-pglite";

let t: TestDb;
let ADMIN: string;
let PM_ADMIN: string;
let MEMBER_1: string;
let MEMBER_2: string;

const grant = (actor: string, profile: string, permission: string) =>
  t.asUser(
    actor,
    "insert into public.employee_permissions (profile_id, permission) values ($1, $2) on conflict do nothing",
    [profile, permission],
  );
const revoke = (actor: string, profile: string, permission: string) =>
  t.asUser(actor, "delete from public.employee_permissions where profile_id = $1 and permission = $2", [
    profile,
    permission,
  ]);
const permissionsOf = async (profile: string) =>
  (
    await t.asService<{ permission: string }>(
      "select permission from public.employee_permissions where profile_id = $1 order by permission",
      [profile],
    )
  ).map((r) => r.permission);

beforeAll(async () => {
  t = await createTestDb();
  ADMIN = t.users["admin@example.test"];
  PM_ADMIN = t.users["pm-admin@example.test"];
  MEMBER_1 = t.users["member1@example.test"];
  MEMBER_2 = t.users["member2@example.test"];
}, 60_000);

beforeEach(async () => {
  await t.asService("delete from public.employee_permissions");
  await t.asService("update public.profiles set is_active = true");
});

describe("дозволи працівника (база)", () => {
  it("AC-ORG-17: адміністратор видає працівнику дозвіл на «Витрату карткою» — дозвіл збережено", async () => {
    await grant(ADMIN, MEMBER_1, "card_expense");
    expect(await permissionsOf(MEMBER_1)).toEqual(["card_expense"]);
    // Повторна видача нічого не ламає (on conflict do nothing).
    await grant(ADMIN, MEMBER_1, "card_expense");
    expect(await permissionsOf(MEMBER_1)).toEqual(["card_expense"]);
  });

  it("AC-ORG-26: після зняття дозволу «Витрати карткою» в працівника її немає", async () => {
    await grant(ADMIN, MEMBER_1, "card_expense");
    await revoke(ADMIN, MEMBER_1, "card_expense");
    expect(await permissionsOf(MEMBER_1)).toEqual([]);
  });

  it("не-адміністратор не видає дозволів ні собі, ні іншим — відмова RLS, рядків немає", async () => {
    await expect(grant(MEMBER_1, MEMBER_1, "self_purchase")).rejects.toThrow(/row-level security/);
    await expect(grant(MEMBER_1, MEMBER_2, "card_expense")).rejects.toThrow(/row-level security/);
    expect(await permissionsOf(MEMBER_1)).toEqual([]);
    expect(await permissionsOf(MEMBER_2)).toEqual([]);
  });

  it("не-адміністратор не забирає дозволів — рядок лишається", async () => {
    await grant(ADMIN, MEMBER_2, "vendor_bill");
    await revoke(MEMBER_1, MEMBER_2, "vendor_bill");
    expect(await permissionsOf(MEMBER_2)).toEqual(["vendor_bill"]);
  });

  it("деактивований адміністратор не видає дозволів", async () => {
    await t.asService("update public.profiles set is_active = false where id = $1", [PM_ADMIN]);
    await expect(grant(PM_ADMIN, MEMBER_1, "card_expense")).rejects.toThrow(/row-level security/);
    expect(await permissionsOf(MEMBER_1)).toEqual([]);
  });

  it("невідомий дозвіл відхиляє перевірка бази", async () => {
    await expect(grant(ADMIN, MEMBER_1, "fly_to_moon")).rejects.toThrow(/employee_permissions_permission_check/);
  });

  it("працівник бачить лише власні дозволи, адміністратор — усі", async () => {
    await grant(ADMIN, MEMBER_1, "card_expense");
    await grant(ADMIN, MEMBER_2, "self_purchase");
    const own = await t.asUser<{ profile_id: string }>(MEMBER_1, "select profile_id from public.employee_permissions");
    expect(own.map((r) => r.profile_id)).toEqual([MEMBER_1]);
    const all = await t.asUser(ADMIN, "select profile_id from public.employee_permissions");
    expect(all).toHaveLength(2);
  });
});
