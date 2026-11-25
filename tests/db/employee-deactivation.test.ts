// Тести бази (PGlite) для задачі 4.1: public.set_active і public.remove_admin_role (обгортки над private.*, міграція
// 20261125150000_employee_deactivation.sql). Адміністратор викликає функції, як дія застосунку (supabase.rpc), а
// результат (profiles.role, profiles.is_active, department_members) перевіряє asService.
// Кожен відмовний тест перевіряє і відмову, і те, що дані не змінились.
import { readFileSync } from "node:fs";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "./supabase-pglite";

let t: TestDb;
let ADMIN: string; // перший адміністратор
let PM_ADMIN: string; // другий адміністратор
let MEMBER_1: string; // працівник без ролі admin
const dept: Record<string, string> = {};
const PRIMARY = "Початкова школа";

const demoRoles = JSON.parse(
  readFileSync(new URL("../../supabase/demo-users.json", import.meta.url), "utf8"),
) as { email: string; role: string }[];

const setActive = (actor: string, profile: string, value: boolean) =>
  t.asUser(actor, "select public.set_active($1, $2)", [profile, value]);
const removeAdminRole = (actor: string, profile: string) =>
  t.asUser(actor, "select public.remove_admin_role($1)", [profile]);

const profileOf = async (profile: string) => {
  const [row] = await t.asService<{ role: string; is_active: boolean }>(
    "select role, is_active from public.profiles where id = $1",
    [profile],
  );
  return row;
};
const approvesPrimary = async (profile: string) => {
  const rows = await t.asService<{ is_approver: boolean }>(
    "select is_approver from public.department_members where department_id = $1 and profile_id = $2",
    [dept[PRIMARY], profile],
  );
  return rows[0]?.is_approver ?? false;
};
/** Схвалювач «Початкової школи»: рядок членства з is_approver (тригер перерахує роль не-адміністратора). */
const makeApproverOfPrimary = (profile: string) =>
  t.asService(
    "insert into public.department_members (department_id, profile_id, is_approver) values ($1, $2, true)",
    [dept[PRIMARY], profile],
  );

beforeAll(async () => {
  t = await createTestDb();
  ADMIN = t.users["admin@example.test"];
  PM_ADMIN = t.users["pm-admin@example.test"];
  MEMBER_1 = t.users["member1@example.test"];
  for (const d of await t.asService<{ id: string; name: string }>("select id, name from public.departments")) {
    dept[d.name] = d.id;
  }
}, 60_000);

// Кожен тест починає зі стану demo-users.json: усі активні, ролі як у файлі, без членств.
beforeEach(async () => {
  await t.asService("delete from public.department_members");
  for (const u of demoRoles) {
    await t.asService("update public.profiles set role = $2, is_active = true where id = $1", [t.users[u.email], u.role]);
  }
});

describe("деактивація й захист адміністратора (база)", () => {
  it("AC-ORG-10: єдиний активний адміністратор не знімає з себе роль — LAST_ADMIN, роль лишається admin", async () => {
    await setActive(ADMIN, PM_ADMIN, false); // другий адміністратор деактивований — ADMIN лишився єдиним активним
    await expect(removeAdminRole(ADMIN, ADMIN)).rejects.toThrow(/LAST_ADMIN/);
    expect(await profileOf(ADMIN)).toEqual({ role: "admin", is_active: true });
  });

  it("AC-ORG-18: єдиний активний адміністратор не деактивує себе — LAST_ADMIN, лишається активним", async () => {
    await setActive(ADMIN, PM_ADMIN, false);
    await expect(setActive(ADMIN, ADMIN, false)).rejects.toThrow(/LAST_ADMIN/);
    expect(await profileOf(ADMIN)).toEqual({ role: "admin", is_active: true });
  });

  it("AC-ORG-21: за наявності іншого активного адміністратора роль можна зняти з себе — requester, другий лишається admin", async () => {
    await removeAdminRole(ADMIN, ADMIN);
    expect((await profileOf(ADMIN)).role).toBe("requester");
    expect(await profileOf(PM_ADMIN)).toEqual({ role: "admin", is_active: true });
  });

  it("AC-ORG-31: інший адміністратор знімає роль з адміністратора без відділів схвалення — requester", async () => {
    await removeAdminRole(ADMIN, PM_ADMIN);
    expect((await profileOf(PM_ADMIN)).role).toBe("requester");
  });

  it("AC-ORG-32: інший адміністратор знімає роль з адміністратора, що схвалює «Початкову школу» — approver, схвалення лишилось", async () => {
    await makeApproverOfPrimary(PM_ADMIN);
    expect((await profileOf(PM_ADMIN)).role).toBe("admin"); // тригер роль admin не чіпає
    await removeAdminRole(ADMIN, PM_ADMIN);
    expect((await profileOf(PM_ADMIN)).role).toBe("approver");
    expect(await approvesPrimary(PM_ADMIN)).toBe(true);
  });

  it("AC-ORG-30: після повторної активації працівник і далі схвалює «Початкову школу», роль approver", async () => {
    await makeApproverOfPrimary(MEMBER_1);
    await setActive(ADMIN, MEMBER_1, false);
    expect(await profileOf(MEMBER_1)).toEqual({ role: "approver", is_active: false });
    await setActive(ADMIN, MEMBER_1, true);
    expect(await profileOf(MEMBER_1)).toEqual({ role: "approver", is_active: true });
    expect(await approvesPrimary(MEMBER_1)).toBe(true);
  });

  it("AC-ORG-12: деактивований працівник після входу не отримує жодних даних — навіть власного профілю", async () => {
    await makeApproverOfPrimary(MEMBER_1);
    expect(await t.asUser(MEMBER_1, "select id from public.profiles where id = $1", [MEMBER_1])).toHaveLength(1);
    await setActive(ADMIN, MEMBER_1, false);
    expect(await t.asUser(MEMBER_1, "select id from public.profiles")).toEqual([]);
    expect(await t.asUser(MEMBER_1, "select department_id from public.department_members")).toEqual([]);
    expect(await t.asUser(MEMBER_1, "select id from public.departments")).toEqual([]);
  });

  it("деактивований адміністратор не може змінювати інших — FORBIDDEN", async () => {
    await setActive(PM_ADMIN, ADMIN, false);
    await expect(setActive(ADMIN, MEMBER_1, false)).rejects.toThrow(/FORBIDDEN/);
    await expect(removeAdminRole(ADMIN, PM_ADMIN)).rejects.toThrow(/FORBIDDEN/);
    expect(await profileOf(MEMBER_1)).toEqual({ role: "requester", is_active: true });
    expect(await profileOf(PM_ADMIN)).toEqual({ role: "admin", is_active: true });
  });

  it("не-адміністратор не деактивує й не знімає роль — FORBIDDEN, дані без змін", async () => {
    await expect(setActive(MEMBER_1, ADMIN, false)).rejects.toThrow(/FORBIDDEN/);
    await expect(removeAdminRole(MEMBER_1, ADMIN)).rejects.toThrow(/FORBIDDEN/);
    expect(await profileOf(ADMIN)).toEqual({ role: "admin", is_active: true });
  });

  it("невідомий працівник — NOT_FOUND", async () => {
    const unknown = "b0000000-0000-0000-0000-000000000099";
    await expect(setActive(ADMIN, unknown, false)).rejects.toThrow(/NOT_FOUND/);
    await expect(removeAdminRole(ADMIN, unknown)).rejects.toThrow(/NOT_FOUND/);
  });

  it("зняти роль з не-адміністратора — нічого не змінює", async () => {
    await removeAdminRole(ADMIN, MEMBER_1);
    expect(await profileOf(MEMBER_1)).toEqual({ role: "requester", is_active: true });
  });

  it("клієнт не змінює role чи is_active напряму (лише через функції)", async () => {
    await expect(
      t.asUser(ADMIN, "update public.profiles set is_active = false where id = $1", [MEMBER_1]),
    ).rejects.toThrow(/permission denied/);
    await expect(t.asUser(ADMIN, "update public.profiles set role = 'admin' where id = $1", [MEMBER_1])).rejects.toThrow(
      /permission denied/,
    );
    expect(await profileOf(MEMBER_1)).toEqual({ role: "requester", is_active: true });
  });

  it("anon не викликає функцій", async () => {
    await expect(t.asAnon("select public.set_active($1, false)", [MEMBER_1])).rejects.toThrow(/permission denied/);
    await expect(t.asAnon("select public.remove_admin_role($1)", [ADMIN])).rejects.toThrow(/permission denied/);
  });
});
