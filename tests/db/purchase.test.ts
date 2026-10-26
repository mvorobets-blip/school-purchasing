// Тести бази (PGlite) для подання закупівлі: RLS, GRANT і функція private.submit_purchase.
// Кожен відмовний тест перевіряє і відмову, і те, що дані не змінились (asService).
import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "./supabase-pglite";

let t: TestDb;
let ADMIN: string;
let MEMBER_1: string; // «працівник 1»: заявник «Початкової школи» й «Офісу», не заявник «Вищої школи», без дозволів
let MEMBER_2: string; // «працівник 2» / «Петро»: заявник «Початкової школи»; єдиний схвалювач «Офісу»
const dept: Record<string, string> = {};

const LINE = [{ name: "Папір А4", purpose: "Для друку", quantity: 3, price: "20.00" }];

const submit = (user: string, department: string, type: string, lines: unknown) =>
  t.asUser<{ id: string }>(user, "select public.submit_purchase($1, $2, $3::jsonb) as id", [
    dept[department],
    type,
    JSON.stringify(lines),
  ]);

const pendingCountOf = async (user: string) => {
  const [row] = await t.asService<{ n: number }>(
    "select count(*)::int as n from public.purchase_requests where author_id = $1 and status = 'pending'",
    [user],
  );
  return row.n;
};

beforeAll(async () => {
  t = await createTestDb();
  ADMIN = t.users["admin@example.test"];
  MEMBER_1 = t.users["member1@example.test"];
  MEMBER_2 = t.users["member2@example.test"];
  for (const d of await t.asService<{ id: string; name: string }>("select id, name from public.departments")) {
    dept[d.name] = d.id;
  }
  await t.asService(
    `insert into public.department_members (department_id, profile_id, is_approver) values
       ($1, $3, false), ($2, $3, false), ($1, $4, false), ($2, $4, true)`,
    [dept["Початкова школа"], dept["Офіс"], MEMBER_1, MEMBER_2],
  );
}, 60_000);

describe("подання закупівлі (база)", () => {
  it("AC-FRM-02: подання в чужий відділ напряму не подано, нової заявки немає", async () => {
    const before = await pendingCountOf(MEMBER_1);
    await expect(submit(MEMBER_1, "Вища школа", "purchasing_department", LINE)).rejects.toThrow(/FORBIDDEN/);
    expect(await pendingCountOf(MEMBER_1)).toBe(before);
  });

  it("AC-FRM-02: прямий insert у purchase_requests відхилено навіть у свій відділ (немає grant), нової заявки немає", async () => {
    const before = await pendingCountOf(MEMBER_1);
    await expect(
      t.asUser(
        MEMBER_1,
        "insert into public.purchase_requests (author_id, department_id, purchase_type) values ($1, $2, 'purchasing_department')",
        [MEMBER_1, dept["Початкова школа"]],
      ),
    ).rejects.toThrow(/permission denied/);
    expect(await pendingCountOf(MEMBER_1)).toBe(before);
  });

  it("AC-FRM-04: «Самостійна закупівля» без дозволу напряму не подана, нової заявки немає", async () => {
    const before = await pendingCountOf(MEMBER_1);
    await expect(submit(MEMBER_1, "Початкова школа", "self_purchase", LINE)).rejects.toThrow(/FORBIDDEN/);
    expect(await pendingCountOf(MEMBER_1)).toBe(before);
  });

  it("AC-FRM-06: без рядків закупівлю не подано", async () => {
    const before = await pendingCountOf(MEMBER_1);
    await expect(submit(MEMBER_1, "Початкова школа", "purchasing_department", [])).rejects.toThrow(/NO_LINES/);
    expect(await pendingCountOf(MEMBER_1)).toBe(before);
  });

  it("AC-FRM-07: подана закупівля має статус «Очікує схвалення»", async () => {
    const [{ id }] = await submit(MEMBER_1, "Початкова школа", "purchasing_department", LINE);
    const [row] = await t.asService<{ status: string; author_id: string }>(
      "select status, author_id from public.purchase_requests where id = $1",
      [id],
    );
    expect(row).toEqual({ status: "pending", author_id: MEMBER_1 });
    const lines = await t.asService<{ name: string; purpose: string; quantity: string; price: string }>(
      "select name, purpose, quantity::text, price::text from public.purchase_request_lines where request_id = $1",
      [id],
    );
    expect(lines).toEqual([{ name: "Папір А4", purpose: "Для друку", quantity: "3", price: "20.00" }]);
  });

  it("AC-FRM-08: заявник того ж відділу не бачить чужої закупівлі, статус не змінюється", async () => {
    const [{ id }] = await submit(MEMBER_1, "Початкова школа", "purchasing_department", LINE);
    expect(await t.asUser(MEMBER_2, "select id from public.purchase_requests where id = $1", [id])).toHaveLength(0);
    expect(await t.asUser(MEMBER_2, "select id from public.purchase_request_lines where request_id = $1", [id])).toHaveLength(0);
    await expect(
      t.asUser(MEMBER_2, "update public.purchase_requests set status = 'approved' where id = $1", [id]),
    ).rejects.toThrow(/permission denied/);
    const [row] = await t.asService<{ status: string }>("select status from public.purchase_requests where id = $1", [id]);
    expect(row.status).toBe("pending");
  });

  it("AC-FRM-09: гість не бачить заявок і не подає закупівлю", async () => {
    await expect(t.asAnon("select id from public.purchase_requests")).rejects.toThrow(/permission denied/);
    await expect(
      t.asAnon("select public.submit_purchase($1, 'purchasing_department', '[]'::jsonb)", [dept["Офіс"]]),
    ).rejects.toThrow(/permission denied/);
  });

  it("AC-FRM-10: у «Моїх заявках» власна закупівля «Очікує схвалення», чужих немає", async () => {
    const [{ id: own }] = await submit(MEMBER_1, "Офіс", "purchasing_department", LINE);
    const [{ id: other }] = await submit(ADMIN, "Вища школа", "purchasing_department", LINE);
    const mine = await t.asUser<{ id: string; status: string; author_id: string }>(
      MEMBER_1,
      "select id, status, author_id from public.purchase_requests where author_id = (select auth.uid())",
    );
    expect(mine).toContainEqual({ id: own, status: "pending", author_id: MEMBER_1 });
    const visible = await t.asUser<{ id: string }>(MEMBER_1, "select id from public.purchase_requests");
    expect(visible.map((r) => r.id)).not.toContain(other);
  });

  it("AC-FRM-12: подання у відділ без активного схвалювача — «Очікує схвалення»", async () => {
    const approvers = await t.asService(
      "select 1 from public.department_members where department_id = $1 and is_approver",
      [dept["Початкова школа"]],
    );
    expect(approvers).toHaveLength(0);
    const [{ id }] = await submit(MEMBER_1, "Початкова школа", "purchasing_department", LINE);
    const [row] = await t.asService<{ status: string }>("select status from public.purchase_requests where id = $1", [id]);
    expect(row.status).toBe("pending");
  });

  it("AC-FRM-13: єдиний схвалювач подає у свій відділ — «Очікує схвалення»", async () => {
    const [{ id }] = await submit(MEMBER_2, "Офіс", "purchasing_department", LINE);
    const [row] = await t.asService<{ status: string; decided_by: string | null }>(
      "select status, decided_by from public.purchase_requests where id = $1",
      [id],
    );
    expect(row).toEqual({ status: "pending", decided_by: null });
  });

  it("рядок з неможливими числами (NaN, Infinity, від'ємні, нуль, не число) не подано", async () => {
    const before = await pendingCountOf(MEMBER_1);
    const bad = [
      { quantity: "NaN", price: "20.00" },
      { quantity: "3", price: "NaN" },
      { quantity: "Infinity", price: "20.00" },
      { quantity: "-5", price: "20.00" },
      { quantity: "0", price: "20.00" },
      { quantity: "3", price: "-1" },
      { quantity: "abc", price: "20.00" },
      { quantity: "3", price: "100000000000" },
    ];
    for (const numbers of bad) {
      await expect(
        submit(MEMBER_1, "Початкова школа", "purchasing_department", [{ name: "Папір А4", purpose: "Друк", ...numbers }]),
      ).rejects.toThrow(/INVALID_LINE/);
    }
    expect(await pendingCountOf(MEMBER_1)).toBe(before);
  });

  it("ціна 0 і дробова кількість допустимі (верхні межі — наступний зріз)", async () => {
    const [{ id }] = await submit(MEMBER_1, "Початкова школа", "purchasing_department", [
      { name: "Безкоштовні буклети", purpose: "Роздати", quantity: "1.5", price: "0" },
    ]);
    expect(id).toBeTruthy();
  });
});

describe("деактивований працівник (база)", () => {
  // Деактивований може отримати токен напряму в Supabase Auth, оминаючи сторінку входу; тоді захищає лише база.
  const GONE = "b0000000-0000-0000-0000-000000000001";
  let requestId: string;

  beforeAll(async () => {
    await t.db.query("insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)", [
      GONE,
      "gone@example.test",
      { full_name: "Ігор Демо-Колишній" },
    ]);
    await t.asService("insert into public.department_members (department_id, profile_id) values ($1, $2)", [
      dept["Початкова школа"],
      GONE,
    ]);
    [{ id: requestId }] = await submit(GONE, "Початкова школа", "purchasing_department", LINE);
    await t.asService("update public.profiles set is_active = false where id = $1", [GONE]);
  });

  it("не бачить ні своїх заявок, ні рядків", async () => {
    expect(await t.asUser(GONE, "select id from public.purchase_requests")).toHaveLength(0);
    expect(
      await t.asUser(GONE, "select id from public.purchase_request_lines where request_id = $1", [requestId]),
    ).toHaveLength(0);
  });

  it("не подає закупівлю, нової заявки немає", async () => {
    const before = await t.asService<{ n: number }>(
      "select count(*)::int as n from public.purchase_requests where author_id = $1",
      [GONE],
    );
    await expect(submit(GONE, "Початкова школа", "purchasing_department", LINE)).rejects.toThrow(/FORBIDDEN/);
    const after = await t.asService<{ n: number }>(
      "select count(*)::int as n from public.purchase_requests where author_id = $1",
      [GONE],
    );
    expect(after[0].n).toBe(before[0].n);
  });
});
