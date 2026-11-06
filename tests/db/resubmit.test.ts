// Тести бази (PGlite) для повторного подання поверненої заявки: public.resubmit_purchase(p_request_id, p_lines)
// (impl-purchase-history, задача 5). Окрема свіжа база: кількість подій і номери рахуємо точно.
// Кожен відмовний тест перевіряє і відмову, і незмінні дані (статус, причина повернення, рядки, кількість подій).
import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "./supabase-pglite";

let t: TestDb;
let MEMBER_1: string; // «працівник 1» — заявник «Початкової школи», автор заявок
let MARIA: string; // «Марія» — схвалювач «Початкової школи» (бачить заявку, але не автор)
let ADMIN: string; // адміністратор — бачить усі заявки, але не автор
const dept: Record<string, string> = {};

type Line = { name: string; purpose: string; quantity: number | string; price: string };
const THREE_LINES: Line[] = [
  { name: "Папір А4", purpose: "Для друку", quantity: 3, price: "20.00" },
  { name: "Маркери", purpose: "Для дошки", quantity: 2, price: "15.50" },
  { name: "Скріпки", purpose: "Для офісу", quantity: 5, price: "1.00" },
];

const submit = async (user = MEMBER_1, lines: Line[] = THREE_LINES) => {
  const [row] = await t.asUser<{ id: string }>(
    user,
    "select public.submit_purchase($1, 'purchasing_department', $2::jsonb) as id",
    [dept["Початкова школа"], JSON.stringify(lines)],
  );
  return row.id;
};
const decide = (user: string, id: string, decision: string, reason: string | null) =>
  t.asUser(user, "select public.decide_purchase($1, $2, $3, $4::integer[])", [id, decision, reason, []]);
const resubmit = (user: string, id: string, lines: unknown) =>
  t.asUser<{ id: string }>(user, "select public.resubmit_purchase($1, $2::jsonb) as id", [id, JSON.stringify(lines)]);

// Повернена заявка працівника 1: подано 3 рядки, Марія повернула з причиною.
const returnedRequest = async () => {
  const id = await submit();
  await decide(MARIA, id, "return", "Уточніть кількість");
  return id;
};

type RequestRow = {
  status: string;
  return_reason: string | null;
  decided_by: string | null;
  decided_at: string | null;
  department_id: string;
  purchase_type: string;
  number: number;
  author_id: string;
  created_at: Date;
};
const requestRow = async (id: string) => {
  const [row] = await t.asService<RequestRow>(
    `select status, return_reason, decided_by, decided_at, department_id, purchase_type, number, author_id, created_at
       from public.purchase_requests where id = $1`,
    [id],
  );
  return row;
};
type LineRow = { position: number; name: string; purpose: string; quantity: number; price: string; status: string | null };
const linesOf = (id: string) =>
  t.asService<LineRow>(
    `select position, name, purpose, quantity::int as quantity, price::text as price, status
       from public.purchase_request_lines where request_id = $1 order by position`,
    [id],
  );
const eventsOf = (id: string) =>
  t.asService<{ kind: string; actor_id: string }>(
    "select kind, actor_id from public.purchase_request_events where request_id = $1 order by created_at, id",
    [id],
  );
// Знімок усього, що повторне подання могло б змінити.
const snapshot = async (id: string) => ({ request: await requestRow(id), lines: await linesOf(id), events: await eventsOf(id) });

beforeAll(async () => {
  t = await createTestDb();
  MEMBER_1 = t.users["member1@example.test"];
  MARIA = t.users["member2@example.test"];
  ADMIN = t.users["admin@example.test"];
  for (const d of await t.asService<{ id: string; name: string }>("select id, name from public.departments")) {
    dept[d.name] = d.id;
  }
  await t.asService(
    `insert into public.department_members (department_id, profile_id, is_approver)
       values ($1, $2, false), ($1, $3, true)`,
    [dept["Початкова школа"], MEMBER_1, MARIA],
  );
}, 60_000);

describe("повторне подання поверненої заявки (база)", () => {
  it("AC-DEC-07: автор виправив рядок 1 (кількість 3 → 5) і подав знову — «pending», той самий відділ", async () => {
    const id = await returnedRequest();
    const before = await requestRow(id);
    expect(before.status).toBe("returned");

    const fixed = [{ ...THREE_LINES[0], quantity: 5 }, THREE_LINES[1], THREE_LINES[2]];
    const [res] = await resubmit(MEMBER_1, id, fixed);
    expect(res.id).toBe(id);

    const after = await requestRow(id);
    expect(after.status).toBe("pending");
    expect(after.department_id).toBe(dept["Початкова школа"]);
    expect(after.department_id).toBe(before.department_id);
    // Рядок 1 виправлено, решта — як були; рядки знову не вирішені.
    expect(await linesOf(id)).toEqual([
      { position: 1, name: "Папір А4", purpose: "Для друку", quantity: 5, price: "20.00", status: null },
      { position: 2, name: "Маркери", purpose: "Для дошки", quantity: 2, price: "15.50", status: null },
      { position: 3, name: "Скріпки", purpose: "Для офісу", quantity: 5, price: "1.00", status: null },
    ]);
  });

  it("після повторного подання тип, номер, автор і час створення ті самі; причину повернення й попереднє рішення знято", async () => {
    const id = await returnedRequest();
    const before = await requestRow(id);
    await resubmit(MEMBER_1, id, THREE_LINES);
    const after = await requestRow(id);
    expect(after).toEqual({
      ...before,
      status: "pending",
      return_reason: null,
      decided_by: null,
      decided_at: null,
    });
    expect(after.number).toBe(before.number);
    expect(after.purchase_type).toBe("purchasing_department");
  });

  it("повторне подання додає в історію ще один запис «submitted» від автора", async () => {
    const id = await returnedRequest();
    expect(await eventsOf(id)).toEqual([{ kind: "submitted", actor_id: MEMBER_1 }]);
    await resubmit(MEMBER_1, id, THREE_LINES);
    expect(await eventsOf(id)).toEqual([
      { kind: "submitted", actor_id: MEMBER_1 },
      { kind: "submitted", actor_id: MEMBER_1 },
    ]);
    // Автор бачить обидва записи у своїй історії.
    const history = await t.asUser<{ kind: string }>(MEMBER_1, "select kind from public.request_history($1::uuid)", [id]);
    expect(history.map((h) => h.kind)).toEqual(["submitted", "submitted"]);
  });

  it("автор додає рядок і прибирає інший — позиції 1..n по порядку, ціну округлено до центів", async () => {
    const id = await returnedRequest();
    await resubmit(MEMBER_1, id, [
      THREE_LINES[1],
      { name: "Ножиці", purpose: "Для уроків праці", quantity: "4", price: "12.345" },
    ]);
    expect(await linesOf(id)).toEqual([
      { position: 1, name: "Маркери", purpose: "Для дошки", quantity: 2, price: "15.50", status: null },
      { position: 2, name: "Ножиці", purpose: "Для уроків праці", quantity: 4, price: "12.35", status: null },
    ]);
    expect((await requestRow(id)).status).toBe("pending");
  });

  it("не автор (схвалювач відділу, адміністратор) — FORBIDDEN, нічого не змінено", async () => {
    const id = await returnedRequest();
    const before = await snapshot(id);
    for (const user of [MARIA, ADMIN]) {
      await expect(resubmit(user, id, THREE_LINES)).rejects.toThrow(/FORBIDDEN/);
      expect(await snapshot(id)).toEqual(before);
    }
  });

  it("заявка не «returned» («pending», «approved») — FORBIDDEN, нічого не змінено", async () => {
    const pending = await submit();
    const pendingBefore = await snapshot(pending);
    await expect(resubmit(MEMBER_1, pending, THREE_LINES)).rejects.toThrow(/FORBIDDEN/);
    expect(await snapshot(pending)).toEqual(pendingBefore);

    const approved = await submit();
    await decide(MARIA, approved, "approve", null);
    const approvedBefore = await snapshot(approved);
    expect(approvedBefore.request.status).toBe("approved");
    await expect(resubmit(MEMBER_1, approved, THREE_LINES)).rejects.toThrow(/FORBIDDEN/);
    expect(await snapshot(approved)).toEqual(approvedBefore);
  });

  it("неіснуюча заявка — FORBIDDEN, як і чужа (не розкриваємо, чи вона є)", async () => {
    await expect(resubmit(MEMBER_1, "00000000-0000-4000-8000-000000000000", THREE_LINES)).rejects.toThrow(/FORBIDDEN/);
  });

  it("неактивний автор — FORBIDDEN, нічого не змінено", async () => {
    const id = await returnedRequest();
    const before = await snapshot(id);
    await t.asService("update public.profiles set is_active = false where id = $1", [MEMBER_1]);
    try {
      await expect(resubmit(MEMBER_1, id, THREE_LINES)).rejects.toThrow(/FORBIDDEN/);
    } finally {
      await t.asService("update public.profiles set is_active = true where id = $1", [MEMBER_1]);
    }
    expect(await snapshot(id)).toEqual(before);
  });

  // Дописав розробник за незалежним рев'ю задачі 5: ті самі права, що при першому поданні.
  it("автора прибрали із заявників відділу після повернення — FORBIDDEN, нічого не змінено", async () => {
    const id = await returnedRequest();
    const before = await snapshot(id);
    await t.asService("delete from public.department_members where department_id = $1 and profile_id = $2", [
      dept["Початкова школа"],
      MEMBER_1,
    ]);
    try {
      await expect(resubmit(MEMBER_1, id, THREE_LINES)).rejects.toThrow(/FORBIDDEN/);
    } finally {
      await t.asService("insert into public.department_members (department_id, profile_id, is_approver) values ($1, $2, false)", [
        dept["Початкова школа"],
        MEMBER_1,
      ]);
    }
    expect(await snapshot(id)).toEqual(before);
  });

  it("рядки перевіряються як при першому поданні — відповідний код, заявка лишається «returned» зі старими рядками й одним записом", async () => {
    const id = await returnedRequest();
    const before = await snapshot(id);
    expect(before.request).toMatchObject({ status: "returned", return_reason: "Уточніть кількість" });
    const cases: [unknown, RegExp][] = [
      [[], /NO_LINES/],
      [[{ ...THREE_LINES[0], name: "" }], /INVALID_LINE/],
      [[{ ...THREE_LINES[0], purpose: "   " }], /INVALID_LINE/],
      [[{ ...THREE_LINES[0], quantity: 1.5 }], /INVALID_QUANTITY/],
      [[{ ...THREE_LINES[0], quantity: 0 }], /INVALID_QUANTITY/],
      [[{ ...THREE_LINES[0], price: "-1" }], /INVALID_PRICE/],
      // Помилка в останньому рядку — жоден рядок не замінено (усе або нічого).
      [[{ ...THREE_LINES[0], quantity: 5 }, { ...THREE_LINES[1], quantity: 2.5 }], /INVALID_QUANTITY/],
    ];
    for (const [lines, code] of cases) {
      await expect(resubmit(MEMBER_1, id, lines)).rejects.toThrow(code);
      expect(await snapshot(id)).toEqual(before);
    }
  });

  it("гість не викликає resubmit_purchase — permission denied, нічого не змінено", async () => {
    const id = await returnedRequest();
    const before = await snapshot(id);
    await expect(
      t.asAnon("select public.resubmit_purchase($1, $2::jsonb)", [id, JSON.stringify(THREE_LINES)]),
    ).rejects.toThrow(/permission denied/);
    expect(await snapshot(id)).toEqual(before);
  });

  it("автор не змінює рядки й статус повернутої заявки напряму, оминаючи функцію — permission denied", async () => {
    const id = await returnedRequest();
    const before = await snapshot(id);
    await expect(
      t.asUser(MEMBER_1, "update public.purchase_requests set status = 'pending' where id = $1", [id]),
    ).rejects.toThrow(/permission denied/);
    await expect(
      t.asUser(MEMBER_1, "update public.purchase_request_lines set quantity = 5 where request_id = $1", [id]),
    ).rejects.toThrow(/permission denied/);
    await expect(
      t.asUser(MEMBER_1, "delete from public.purchase_request_lines where request_id = $1", [id]),
    ).rejects.toThrow(/permission denied/);
    expect(await snapshot(id)).toEqual(before);
  });
});
