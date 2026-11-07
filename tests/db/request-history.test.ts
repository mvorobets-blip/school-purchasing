// Тести бази (PGlite) для історії заявки (impl-purchase-history, задача 2): таблиця public.purchase_request_events,
// подія «submitted» у private.submit_purchase і функція public.request_history(p_request_id).
// Окрема свіжа база: кількість подій рахуємо точно, без заявок з інших файлів.
// Кожен відмовний тест перевіряє і відмову, і незмінний стан (asService).
import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "./supabase-pglite";

interface HistoryRow {
  kind: string;
  actor_name: string;
  created_at: string | Date;
}

let t: TestDb;
let ADMIN: string; // автор заявки «Офісу»
let MEMBER_1: string; // «працівник 1» — заявник «Початкової школи»
let MARIA: string; // схвалювач «Початкової школи» (регресія: схвалювач відділу заявки бачить історію)
let PETRO: string; // «Петро» — схвалювач лише «Офісу»
const dept: Record<string, string> = {};
const LINE = JSON.stringify([{ name: "Папір А4", purpose: "Для друку", quantity: 3, price: "20.00" }]);

const submit = async (user: string, department: string) => {
  const [row] = await t.asUser<{ id: string }>(user, "select public.submit_purchase($1, 'purchasing_department', $2::jsonb) as id", [
    dept[department],
    LINE,
  ]);
  return row.id;
};
const history = (user: string, id: string) =>
  t.asUser<HistoryRow>(user, "select * from public.request_history($1::uuid)", [id]);
const eventCount = async (id: string) => {
  const [row] = await t.asService<{ n: number }>(
    "select count(*)::int as n from public.purchase_request_events where request_id = $1",
    [id],
  );
  return row.n;
};
const requestOf = async (id: string) => {
  const [row] = await t.asService<{ status: string; created_at: Date }>(
    "select status, created_at from public.purchase_requests where id = $1",
    [id],
  );
  return row;
};
const profileOf = async (id: string) => {
  const [row] = await t.asService<{ full_name: string | null; email: string }>(
    "select full_name, email from public.profiles where id = $1",
    [id],
  );
  return row;
};

let primary: string; // заявка працівника 1 у «Початковій школі»
let office: string; // заявка адміністратора в «Офісі»

beforeAll(async () => {
  t = await createTestDb();
  ADMIN = t.users["admin@example.test"];
  MEMBER_1 = t.users["member1@example.test"];
  MARIA = t.users["member2@example.test"];
  PETRO = t.users["pm-approver@example.test"];
  for (const d of await t.asService<{ id: string; name: string }>("select id, name from public.departments")) {
    dept[d.name] = d.id;
  }
  await t.asService(
    `insert into public.department_members (department_id, profile_id, is_approver)
     values ($1, $2, false), ($1, $3, true), ($4, $5, true)`,
    [dept["Початкова школа"], MEMBER_1, MARIA, dept["Офіс"], PETRO],
  );
  primary = await submit(MEMBER_1, "Початкова школа");
  office = await submit(ADMIN, "Офіс");
}, 60_000);

describe("історія заявки (база)", () => {
  it("AC-HIST-06: працівник 1 подав закупівлю в «Початкову школу» — в історії один запис «submitted» з його іменем і часом подання", async () => {
    const member1 = await profileOf(MEMBER_1);
    expect(member1.full_name).toBeTruthy();
    const rows = await history(MEMBER_1, primary);
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe("submitted");
    expect(rows[0].actor_name).toBe(member1.full_name);
    // Подію записано в тій самій транзакції, що й заявку, — час той самий.
    expect(new Date(rows[0].created_at).getTime()).toBe(new Date((await requestOf(primary)).created_at).getTime());
    // Автор події в таблиці — сам працівник 1.
    const events = await t.asService<{ kind: string; actor_id: string }>(
      "select kind, actor_id from public.purchase_request_events where request_id = $1",
      [primary],
    );
    expect(events).toEqual([{ kind: "submitted", actor_id: MEMBER_1 }]);
  });

  it("автор без імені в профілі — в історії його email", async () => {
    const before = await profileOf(MEMBER_1);
    try {
      for (const empty of [null, "  "]) {
        await t.asService("update public.profiles set full_name = $2 where id = $1", [MEMBER_1, empty]);
        const rows = await history(MEMBER_1, primary);
        expect(rows.map((r) => [r.kind, r.actor_name])).toEqual([["submitted", before.email]]);
      }
    } finally {
      await t.asService("update public.profiles set full_name = $2 where id = $1", [MEMBER_1, before.full_name]);
    }
  });

  it("AC-HIST-10: Петро (схвалює лише «Офіс») за прямим посиланням не отримує історії заявки «Початкової школи», статус не змінився", async () => {
    expect(await eventCount(primary)).toBe(1);
    expect(await history(PETRO, primary)).toEqual([]);
    expect(
      await t.asUser(PETRO, "select * from public.purchase_request_events where request_id = $1", [primary]),
    ).toEqual([]);
    expect(await t.asUser(PETRO, "select id from public.purchase_requests where id = $1", [primary])).toEqual([]);
    expect((await requestOf(primary)).status).toBe("pending");
    expect(await eventCount(primary)).toBe(1);
  });

  it("схвалювач відділу заявки й адміністратор бачать її історію; Петро — історію заявки «Офісу»", async () => {
    const member1 = await profileOf(MEMBER_1);
    const admin = await profileOf(ADMIN);
    expect((await history(MARIA, primary)).map((r) => [r.kind, r.actor_name])).toEqual([["submitted", member1.full_name]]);
    expect((await history(ADMIN, primary)).map((r) => [r.kind, r.actor_name])).toEqual([["submitted", member1.full_name]]);
    expect((await history(PETRO, office)).map((r) => [r.kind, r.actor_name])).toEqual([["submitted", admin.full_name]]);
    // Подія видна й прямим select за RLS тим, кому видно заявку.
    expect(
      await t.asUser(MARIA, "select kind from public.purchase_request_events where request_id = $1", [primary]),
    ).toEqual([{ kind: "submitted" }]);
  });

  it("історія — лише події цієї заявки, впорядковані за часом", async () => {
    const second = await submit(MEMBER_1, "Початкова школа");
    const rows = await history(MEMBER_1, second);
    expect(rows).toHaveLength(1);
    expect(await history(MEMBER_1, primary)).toHaveLength(1);
    // Порядок за created_at: подія пізнішої заявки не раніша за подію першої.
    const [first] = await history(MEMBER_1, primary);
    expect(new Date(rows[0].created_at).getTime()).toBeGreaterThanOrEqual(new Date(first.created_at).getTime());
  });

  it("заявник того ж відділу не бачить історії чужої заявки", async () => {
    const own = await submit(ADMIN, "Початкова школа");
    expect(await history(MEMBER_1, own)).toEqual([]);
    expect(await t.asUser(MEMBER_1, "select * from public.purchase_request_events where request_id = $1", [own])).toEqual(
      [],
    );
  });

  it("історія не редагується: прямий insert, update і delete події — permission denied, подій не побільшало", async () => {
    expect(await eventCount(primary)).toBe(1);
    await expect(
      t.asUser(
        MEMBER_1,
        "insert into public.purchase_request_events (request_id, kind, actor_id) values ($1, 'submitted', $2)",
        [primary, MEMBER_1],
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(
      t.asUser(MEMBER_1, "update public.purchase_request_events set created_at = now() - interval '1 day' where request_id = $1", [
        primary,
      ]),
    ).rejects.toThrow(/permission denied/);
    await expect(
      t.asUser(MEMBER_1, "delete from public.purchase_request_events where request_id = $1", [primary]),
    ).rejects.toThrow(/permission denied/);
    // Адміністратор теж не редагує історію напряму.
    await expect(
      t.asUser(ADMIN, "delete from public.purchase_request_events where request_id = $1", [primary]),
    ).rejects.toThrow(/permission denied/);
    expect(await eventCount(primary)).toBe(1);
    const [event] = await t.asService<{ created_at: Date }>(
      "select created_at from public.purchase_request_events where request_id = $1",
      [primary],
    );
    expect(new Date(event.created_at).getTime()).toBe(new Date((await requestOf(primary)).created_at).getTime());
  });

  it("гість без входу: історія й таблиця подій — permission denied", async () => {
    await expect(t.asAnon("select * from public.request_history($1::uuid)", [primary])).rejects.toThrow(/permission denied/);
    await expect(t.asAnon("select * from public.purchase_request_events")).rejects.toThrow(/permission denied/);
    expect(await eventCount(primary)).toBe(1);
  });

  it("деактивований автор не бачить історії власної заявки", async () => {
    await t.asService("update public.profiles set is_active = false where id = $1", [MEMBER_1]);
    try {
      expect(await history(MEMBER_1, primary)).toEqual([]);
      expect(await t.asUser(MEMBER_1, "select * from public.purchase_request_events")).toEqual([]);
    } finally {
      await t.asService("update public.profiles set is_active = true where id = $1", [MEMBER_1]);
    }
  });
});
