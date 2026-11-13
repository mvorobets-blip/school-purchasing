// Тести бази (PGlite) для правила ролей зрізу 1: функції public.add_requester, public.remove_requester,
// public.set_approver, public.set_auto_approve (обгортки над private.*, міграція 20261021231637) і тригер
// department_members_sync_role → private.sync_role (міграція 20261021213618). Ті самі AC, що tests/org/roles.test.ts і
// tests/org/membership.test.ts доводять на TS-моделі, тут — на справжній базі: адміністратор викликає функції, як дія
// застосунку (supabase.rpc), а результат (рядки department_members і profiles.role) перевіряє asService.
// Кожен відмовний тест перевіряє і відмову, і те, що ні рядки, ні роль не змінились.
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "./supabase-pglite";

let t: TestDb;
let ADMIN: string; // адміністратор, що виконує всі зміни
let PM_ADMIN: string; // другий адміністратор — той, кого призначають і прибирають (AC-ORG-11, 20)
let MEMBER_1: string; // працівник без ролі admin, над яким виконують зміни
let MEMBER_2: string; // ще один працівник — автор заявки для AC-ORG-20
let APPROVER: string; // схвалювач (approver-primary) — для регресійного тесту прав
const dept: Record<string, string> = {};

const PRIMARY = "Початкова школа";
const HIGH = "Вища школа";
const OFFICE = "Офіс";

interface MemberRow {
  department: string;
  is_approver: boolean;
  auto_approve: boolean;
}

const asAdmin = (sql: string, params: unknown[]) => t.asUser(ADMIN, sql, params);
const addRequester = (department: string, profile: string) =>
  asAdmin("select public.add_requester($1, $2)", [dept[department], profile]);
const removeRequester = (department: string, profile: string) =>
  asAdmin("select public.remove_requester($1, $2)", [dept[department], profile]);
const setApprover = (department: string, profile: string, value: boolean) =>
  asAdmin("select public.set_approver($1, $2, $3)", [dept[department], profile, value]);
const setAutoApprove = (department: string, profile: string, value: boolean) =>
  asAdmin("select public.set_auto_approve($1, $2, $3)", [dept[department], profile, value]);

/** Членства працівника в обхід RLS, упорядковані за назвою відділу (collate "C": «Офіс» перед «Початковою школою»). */
const membershipsOf = (profile: string) =>
  t.asService<MemberRow>(
    `select d.name as department, m.is_approver, m.auto_approve
       from public.department_members as m join public.departments as d on d.id = m.department_id
      where m.profile_id = $1
      order by d.name collate "C"`,
    [profile],
  );
const roleOf = async (profile: string) => {
  const [row] = await t.asService<{ role: string }>("select role from public.profiles where id = $1", [profile]);
  return row.role;
};

beforeAll(async () => {
  t = await createTestDb();
  ADMIN = t.users["admin@example.test"];
  PM_ADMIN = t.users["pm-admin@example.test"];
  MEMBER_1 = t.users["member1@example.test"];
  MEMBER_2 = t.users["member2@example.test"];
  APPROVER = t.users["approver-primary@example.test"];
  for (const d of await t.asService<{ id: string; name: string }>("select id, name from public.departments")) {
    dept[d.name] = d.id;
  }
}, 60_000);

// Кожен тест починає з чистих членств; ролі не-адміністраторів після видалення перераховує сам тригер (requester).
beforeEach(async () => {
  await t.asService("delete from public.department_members");
});

describe("правило ролей і членства (база)", () => {
  it("AC-ORG-01: працівник без відділів після додавання до «Початкової школи» має серед відділів лише «Початкову школу»", async () => {
    expect(await membershipsOf(MEMBER_1)).toEqual([]);
    await addRequester(PRIMARY, MEMBER_1);
    expect(await membershipsOf(MEMBER_1)).toEqual([{ department: PRIMARY, is_approver: false, auto_approve: false }]);
    // Профіль читає відділи під RLS самого працівника — він бачить ту саму «Початкову школу».
    const own = await t.asUser<{ name: string }>(MEMBER_1, "select name from public.departments order by name");
    expect(own.map((d) => d.name)).toEqual([PRIMARY]);
    expect(await roleOf(MEMBER_1)).toBe("requester");
  });

  it("AC-ORG-02: призначення схвалювачем «Вищої школи» не заявника відхилено (NOT_REQUESTER), членства й роль не змінились", async () => {
    await addRequester(PRIMARY, MEMBER_1);
    await expect(setApprover(HIGH, MEMBER_1, true)).rejects.toThrow(/NOT_REQUESTER/);
    expect(await membershipsOf(MEMBER_1)).toEqual([{ department: PRIMARY, is_approver: false, auto_approve: false }]);
    expect(await roleOf(MEMBER_1)).toBe("requester");
  });

  it("AC-ORG-03: зняття заявника «Початкової школи» знімає й схвалення цього відділу", async () => {
    await addRequester(PRIMARY, MEMBER_1);
    await setApprover(PRIMARY, MEMBER_1, true);
    expect(await membershipsOf(MEMBER_1)).toEqual([{ department: PRIMARY, is_approver: true, auto_approve: false }]);
    await removeRequester(PRIMARY, MEMBER_1);
    const [row] = await t.asService<{ n: number }>(
      "select count(*)::int as n from public.department_members where profile_id = $1 and department_id = $2 and is_approver",
      [MEMBER_1, dept[PRIMARY]],
    );
    expect(row.n).toBe(0);
    expect(await membershipsOf(MEMBER_1)).toEqual([]);
  });

  it("AC-ORG-04: схвалювач єдиного відділу після зняття зі схвалювачів стає requester", async () => {
    await addRequester(PRIMARY, MEMBER_1);
    await setApprover(PRIMARY, MEMBER_1, true);
    expect(await roleOf(MEMBER_1)).toBe("approver");
    await setApprover(PRIMARY, MEMBER_1, false);
    expect(await roleOf(MEMBER_1)).toBe("requester");
    // Зняття зі схвалювачів не прибирає членство заявника.
    expect(await membershipsOf(MEMBER_1)).toEqual([{ department: PRIMARY, is_approver: false, auto_approve: false }]);
  });

  it("AC-ORG-05: працівник без ролі admin, призначений схвалювачем відділу, де він заявник, стає approver", async () => {
    await addRequester(PRIMARY, MEMBER_1);
    expect(await roleOf(MEMBER_1)).toBe("requester");
    await setApprover(PRIMARY, MEMBER_1, true);
    expect(await roleOf(MEMBER_1)).toBe("approver");
    expect(await membershipsOf(MEMBER_1)).toEqual([{ department: PRIMARY, is_approver: true, auto_approve: false }]);
  });

  it("AC-ORG-06: автосхвалення лише в «Офісі» не вмикає його в «Початковій школі»", async () => {
    await addRequester(PRIMARY, MEMBER_1);
    await addRequester(OFFICE, MEMBER_1);
    await setAutoApprove(OFFICE, MEMBER_1, true);
    expect(await membershipsOf(MEMBER_1)).toEqual([
      { department: OFFICE, is_approver: false, auto_approve: true },
      { department: PRIMARY, is_approver: false, auto_approve: false },
    ]);
  });

  it("AC-ORG-11: адміністратор, якого прибрали з усіх відділів, лишається admin", async () => {
    await addRequester(PRIMARY, PM_ADMIN);
    await addRequester(OFFICE, PM_ADMIN);
    await setApprover(PRIMARY, PM_ADMIN, true);
    expect(await roleOf(PM_ADMIN)).toBe("admin");
    await removeRequester(PRIMARY, PM_ADMIN);
    await removeRequester(OFFICE, PM_ADMIN);
    expect(await membershipsOf(PM_ADMIN)).toEqual([]);
    expect(await roleOf(PM_ADMIN)).toBe("admin");
  });

  it("AC-ORG-15: зняття заявника «Початкової школи» знімає автосхвалення цього відділу", async () => {
    await addRequester(PRIMARY, MEMBER_1);
    await setAutoApprove(PRIMARY, MEMBER_1, true);
    expect(await membershipsOf(MEMBER_1)).toEqual([{ department: PRIMARY, is_approver: false, auto_approve: true }]);
    await removeRequester(PRIMARY, MEMBER_1);
    const [row] = await t.asService<{ n: number }>(
      "select count(*)::int as n from public.department_members where profile_id = $1 and department_id = $2 and auto_approve",
      [MEMBER_1, dept[PRIMARY]],
    );
    expect(row.n).toBe(0);
    // Повторне додавання заявником не повертає автосхвалення.
    await addRequester(PRIMARY, MEMBER_1);
    expect(await membershipsOf(MEMBER_1)).toEqual([{ department: PRIMARY, is_approver: false, auto_approve: false }]);
  });

  it("AC-ORG-19: схвалювач двох відділів після зняття лише з «Офісу» лишається approver і схвалює «Початкову школу»", async () => {
    await addRequester(PRIMARY, MEMBER_1);
    await addRequester(OFFICE, MEMBER_1);
    await setApprover(PRIMARY, MEMBER_1, true);
    await setApprover(OFFICE, MEMBER_1, true);
    await setApprover(OFFICE, MEMBER_1, false);
    expect(await roleOf(MEMBER_1)).toBe("approver");
    expect(await membershipsOf(MEMBER_1)).toEqual([
      { department: OFFICE, is_approver: false, auto_approve: false },
      { department: PRIMARY, is_approver: true, auto_approve: false },
    ]);
  });

  it("AC-ORG-20: адміністратор, призначений схвалювачем відділу, де він заявник, лишається admin і схвалює цей відділ", async () => {
    await addRequester(PRIMARY, PM_ADMIN);
    await addRequester(PRIMARY, MEMBER_2);
    const [{ id }] = await t.asUser<{ id: string }>(
      MEMBER_2,
      "select public.submit_purchase($1, 'purchasing_department', $2::jsonb) as id",
      [dept[PRIMARY], JSON.stringify([{ name: "Папір А4", purpose: "Для друку", quantity: 3, price: "20.00" }])],
    );
    const canDecide = async () => {
      const [row] = await t.asUser<{ ok: boolean }>(PM_ADMIN, "select public.can_decide_purchase($1::uuid) as ok", [id]);
      return row.ok;
    };
    expect(await canDecide()).toBe(false);
    await setApprover(PRIMARY, PM_ADMIN, true);
    expect(await roleOf(PM_ADMIN)).toBe("admin");
    expect(await membershipsOf(PM_ADMIN)).toEqual([{ department: PRIMARY, is_approver: true, auto_approve: false }]);
    expect(await canDecide()).toBe(true);
  });

  it("AC-ORG-24: схвалювач лише «Початкової школи» після зняття як заявника стає requester", async () => {
    await addRequester(PRIMARY, MEMBER_1);
    await setApprover(PRIMARY, MEMBER_1, true);
    expect(await roleOf(MEMBER_1)).toBe("approver");
    await removeRequester(PRIMARY, MEMBER_1);
    expect(await membershipsOf(MEMBER_1)).toEqual([]);
    expect(await roleOf(MEMBER_1)).toBe("requester");
  });

  it("AC-ORG-33: увімкнення автосхвалення у «Вищій школі» не заявнику відхилено (NOT_REQUESTER), членства й роль не змінились", async () => {
    await addRequester(PRIMARY, MEMBER_1);
    await expect(setAutoApprove(HIGH, MEMBER_1, true)).rejects.toThrow(/NOT_REQUESTER/);
    expect(await membershipsOf(MEMBER_1)).toEqual([{ department: PRIMARY, is_approver: false, auto_approve: false }]);
    expect(await roleOf(MEMBER_1)).toBe("requester");
  });

  it("не адміністратор (заявник чи схвалювач) не може призначити схвалювача: FORBIDDEN, членства й ролі не змінились", async () => {
    await addRequester(PRIMARY, MEMBER_1);
    await addRequester(PRIMARY, APPROVER);
    await setApprover(PRIMARY, APPROVER, true);
    const before = { member: await membershipsOf(MEMBER_1), approver: await membershipsOf(APPROVER) };

    // Заявник призначає себе схвалювачем.
    await expect(
      t.asUser(MEMBER_1, "select public.set_approver($1, $2, true)", [dept[PRIMARY], MEMBER_1]),
    ).rejects.toThrow(/FORBIDDEN/);
    // Схвалювач відділу призначає схвалювачем колегу-заявника.
    await expect(
      t.asUser(APPROVER, "select public.set_approver($1, $2, true)", [dept[PRIMARY], MEMBER_1]),
    ).rejects.toThrow(/FORBIDDEN/);

    expect(await membershipsOf(MEMBER_1)).toEqual(before.member);
    expect(await membershipsOf(APPROVER)).toEqual(before.approver);
    expect(await roleOf(MEMBER_1)).toBe("requester");
    expect(await roleOf(APPROVER)).toBe("approver");
  });
});
