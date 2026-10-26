// Тести бази (PGlite) для рішення схвалювача: RLS списку для рішення й функція private.decide_purchase.
// Кожен відмовний тест перевіряє і відмову, і незмінний статус (asService).
import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "./supabase-pglite";

let t: TestDb;
let ADMIN: string; // автор заявок «Офісу» й одної заявки «Початкової школи»
let MEMBER_1: string; // «працівник 1» — лише заявник «Початкової школи» (role requester)
let MARIA: string; // «Марія» — схвалювач лише «Початкової школи»; також автор власної заявки там (для AC-APR-05)
const dept: Record<string, string> = {};
const LINE = JSON.stringify([{ name: "Папір А4", purpose: "Для друку", quantity: 3, price: "20.00" }]);

const submit = async (user: string, department: string) => {
  const [row] = await t.asUser<{ id: string }>(user, "select public.submit_purchase($1, 'purchasing_department', $2::jsonb) as id", [
    dept[department],
    LINE,
  ]);
  return row.id;
};
const decide = (user: string, id: string, decision: string, reason: string | null = null) =>
  t.asUser(user, "select public.decide_purchase($1, $2, $3)", [id, decision, reason]);
const statusOf = async (id: string) => {
  const [row] = await t.asService<{ status: string; reject_reason: string | null }>(
    "select status, reject_reason from public.purchase_requests where id = $1",
    [id],
  );
  return row;
};
// Список для рішення — як на сторінці «На рішення»: подані заявки відділів, які людина схвалює, крім власних.
const decisionList = (user: string) =>
  t.asUser<{ id: string }>(
    user,
    `select r.id from public.purchase_requests as r
       join public.department_members as m
         on m.department_id = r.department_id and m.profile_id = (select auth.uid()) and m.is_approver
      where r.status = 'pending' and r.author_id <> (select auth.uid())`,
  );

let primary1: string;
let primary2: string;
let office1: string;
let mariaOwn: string;

beforeAll(async () => {
  t = await createTestDb();
  ADMIN = t.users["admin@example.test"];
  MEMBER_1 = t.users["member1@example.test"];
  MARIA = t.users["member2@example.test"];
  for (const d of await t.asService<{ id: string; name: string }>("select id, name from public.departments")) {
    dept[d.name] = d.id;
  }
  await t.asService(
    `insert into public.department_members (department_id, profile_id, is_approver) values ($1, $2, false), ($1, $3, true)`,
    [dept["Початкова школа"], MEMBER_1, MARIA],
  );
  primary1 = await submit(MEMBER_1, "Початкова школа");
  primary2 = await submit(ADMIN, "Початкова школа");
  office1 = await submit(ADMIN, "Офіс");
  mariaOwn = await submit(MARIA, "Початкова школа");
}, 60_000);

describe("рішення схвалювача (база)", () => {
  it("AC-APR-01: у списку Марії дві заявки «Початкової школи», заявки «Офісу» немає", async () => {
    const ids = (await decisionList(MARIA)).map((r) => r.id);
    expect(ids.sort()).toEqual([primary1, primary2].sort());
    expect(ids).not.toContain(office1);
  });

  it("AC-APR-03: заявку «Офісу» Марії не показано й вирішити не можна, статус не змінюється", async () => {
    expect(await t.asUser(MARIA, "select id from public.purchase_requests where id = $1", [office1])).toHaveLength(0);
    await expect(decide(MARIA, office1, "approve")).rejects.toThrow(/FORBIDDEN/);
    expect((await statusOf(office1)).status).toBe("pending");
  });

  it("AC-APR-04: заявник не бачить заявок для рішення й не вирішує, статуси не змінюються", async () => {
    expect(await decisionList(MEMBER_1)).toHaveLength(0);
    await expect(decide(MEMBER_1, primary2, "approve")).rejects.toThrow(/FORBIDDEN/);
    expect((await statusOf(primary2)).status).toBe("pending");
  });

  it("AC-APR-05: схвалювач не схвалює власну заявку напряму — статус лишається «Очікує схвалення»", async () => {
    await expect(decide(MARIA, mariaOwn, "approve")).rejects.toThrow(/OWN_REQUEST/);
    expect((await statusOf(mariaOwn)).status).toBe("pending");
  });

  it("AC-APR-06: відхилення без причини не збережено — статус лишається «Очікує схвалення»", async () => {
    await expect(decide(MARIA, primary1, "reject", "   ")).rejects.toThrow(/NO_REASON/);
    expect(await statusOf(primary1)).toEqual({ status: "pending", reject_reason: null });
  });

  it("AC-APR-02: Марія схвалює заявку свого відділу — «Схвалено»", async () => {
    await decide(MARIA, primary2, "approve");
    expect((await statusOf(primary2)).status).toBe("approved");
  });

  it("AC-APR-07: відхилення з причиною «Немає бюджету» — «Відхилено», причину збережено", async () => {
    await decide(MARIA, primary1, "reject", "Немає бюджету");
    expect(await statusOf(primary1)).toEqual({ status: "rejected", reject_reason: "Немає бюджету" });
  });

  it("AC-APR-07: причину відхилення бачить автор заявки (рішення PM #59)", async () => {
    const rows = await t.asUser<{ status: string; reject_reason: string | null }>(
      MEMBER_1,
      "select status, reject_reason from public.purchase_requests where id = $1",
      [primary1],
    );
    expect(rows).toEqual([{ status: "rejected", reject_reason: "Немає бюджету" }]);
  });

  it("вирішену заявку вдруге не вирішують, і статус не змінюється напряму без функції", async () => {
    await expect(decide(MARIA, primary2, "reject", "Пізно")).rejects.toThrow(/NOT_PENDING/);
    await expect(
      t.asUser(MARIA, "update public.purchase_requests set status = 'pending' where id = $1", [primary2]),
    ).rejects.toThrow(/permission denied/);
    expect((await statusOf(primary2)).status).toBe("approved");
  });

  it("ім'я автора бачить схвалювач відділу заявки; чужий відділ і заявник — ні", async () => {
    const names = (user: string, ids: string[]) =>
      t.asUser<{ request_id: string; author_name: string | null }>(
        user,
        "select request_id, author_name from public.request_author_names($1::uuid[])",
        [ids],
      );
    const [member1] = await t.asService<{ full_name: string }>("select full_name from public.profiles where id = $1", [
      MEMBER_1,
    ]);
    // Марія — схвалювач «Початкової школи»: бачить автора заявки свого відділу, але не заявки «Офісу».
    expect(await names(MARIA, [primary1, office1])).toEqual([{ request_id: primary1, author_name: member1.full_name }]);
    // Заявник бачить лише себе як автора власної заявки, чужих імен — ні.
    expect((await names(MEMBER_1, [primary1, primary2])).map((r) => r.request_id)).toEqual([primary1]);
    await expect(t.asAnon("select * from public.request_author_names($1::uuid[])", [[primary1]])).rejects.toThrow(
      /permission denied/,
    );
  });

  const authorNames = (user: string, ids: string[]) =>
    t.asUser<Record<string, unknown>>(user, "select * from public.request_author_names($1::uuid[])", [ids]);

  it("AC-APR-08: схвалювач бачить ім'я автора заявки свого відділу з профілю", async () => {
    const [member1] = await t.asService<{ full_name: string }>("select full_name from public.profiles where id = $1", [
      MEMBER_1,
    ]);
    expect(member1.full_name).toBeTruthy();
    expect(await authorNames(MARIA, [primary1])).toEqual([{ request_id: primary1, author_name: member1.full_name }]);
  });

  it("AC-APR-09: автор без імені в профілі — схвалювач бачить його email", async () => {
    const [before] = await t.asService<{ full_name: string | null; email: string }>(
      "select full_name, email from public.profiles where id = $1",
      [MEMBER_1],
    );
    try {
      for (const empty of [null, "  "]) {
        await t.asService("update public.profiles set full_name = $2 where id = $1", [MEMBER_1, empty]);
        expect(await authorNames(MARIA, [primary1])).toEqual([{ request_id: primary1, author_name: before.email }]);
      }
    } finally {
      await t.asService("update public.profiles set full_name = $2 where id = $1", [MEMBER_1, before.full_name]);
    }
  });

  it("AC-APR-10: про автора схвалювач отримує лише ім'я — без ролі, відділів і дозволів", async () => {
    const [row] = await authorNames(MARIA, [primary1]);
    expect(Object.keys(row).sort()).toEqual(["author_name", "request_id"]);
    // Профіль колеги закритий RLS: роль автора напряму не прочитати.
    expect(await t.asUser(MARIA, "select role from public.profiles where id = $1", [MEMBER_1])).toEqual([]);
  });

  it("AC-FRM-13: єдиний схвалювач відділу не вирішує власну заявку — вона чекає «Очікує схвалення»", async () => {
    await t.asService("insert into public.department_members (department_id, profile_id, is_approver) values ($1, $2, true)", [
      dept["Вища школа"],
      MARIA,
    ]);
    const own = await submit(MARIA, "Вища школа");
    expect((await decisionList(MARIA)).map((r) => r.id)).not.toContain(own);
    await expect(decide(MARIA, own, "approve")).rejects.toThrow(/OWN_REQUEST/);
    expect((await statusOf(own)).status).toBe("pending");
  });

  it("деактивований схвалювач не вирішує й не бачить заявок, статус не змінюється", async () => {
    const fresh = await submit(MEMBER_1, "Початкова школа");
    await t.asService("update public.profiles set is_active = false where id = $1", [MARIA]);
    expect(await t.asUser(MARIA, "select id from public.purchase_requests")).toHaveLength(0);
    await expect(decide(MARIA, fresh, "approve")).rejects.toThrow(/FORBIDDEN/);
    expect((await statusOf(fresh)).status).toBe("pending");
  });
});
