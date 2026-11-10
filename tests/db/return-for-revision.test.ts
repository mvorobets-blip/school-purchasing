// Тести бази (PGlite) для повернення заявки на доопрацювання: public.decide_purchase з рішенням 'return'
// і колонка purchase_requests.return_reason (задача 4 плану impl-purchase-history).
// Кожен відмовний тест перевіряє і відмову, і незмінні дані (статус «pending», без причини повернення, без рішення).
import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "./supabase-pglite";

let t: TestDb;
let MEMBER_1: string; // «працівник 1» — заявник «Початкової школи», автор заявок
let MARIA: string; // «Марія» — схвалювач лише «Початкової школи»
let PETRO: string; // схвалювач лише «Офісу» — для відмови «чужий відділ»
const dept: Record<string, string> = {};
const TWO_LINES = JSON.stringify([
  { name: "Папір А4", purpose: "Для друку", quantity: 3, price: "20.00" },
  { name: "Маркери", purpose: "Для дошки", quantity: 2, price: "15.50" },
]);

const submit = async (user: string, department = "Початкова школа") => {
  const [row] = await t.asUser<{ id: string }>(
    user,
    "select public.submit_purchase($1, 'purchasing_department', $2::jsonb) as id",
    [dept[department], TWO_LINES],
  );
  return row.id;
};
const decide = (user: string, id: string, decision: string, reason: string | null, positions: number[] = []) =>
  t.asUser(user, "select public.decide_purchase($1, $2, $3, $4::integer[])", [id, decision, reason, positions]);

type Row = { status: string; return_reason: string | null; decided_by: string | null; decided_at: string | null };
const requestRow = async (id: string) => {
  const [row] = await t.asService<Row>(
    "select status, return_reason, decided_by, decided_at from public.purchase_requests where id = $1",
    [id],
  );
  return row;
};
const lineStatuses = async (id: string) =>
  (
    await t.asService<{ status: string | null }>(
      "select status from public.purchase_request_lines where request_id = $1 order by position",
      [id],
    )
  ).map((r) => r.status);
// Нічого не змінено: заявка «pending», без причини повернення й рішення, рядки не вирішені.
const expectUnchanged = async (id: string) => {
  expect(await requestRow(id)).toEqual({ status: "pending", return_reason: null, decided_by: null, decided_at: null });
  expect(await lineStatuses(id)).toEqual([null, null]);
};

beforeAll(async () => {
  t = await createTestDb();
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
}, 60_000);

describe("повернення на доопрацювання (база)", () => {
  it("AC-DEC-04: Марія повертає заявку з причиною «Уточніть кількість» — автор бачить «returned» і причину", async () => {
    const id = await submit(MEMBER_1);
    await decide(MARIA, id, "return", "Уточніть кількість");

    // Автор бачить статус і причину під своїм RLS.
    const [seen] = await t.asUser<{ status: string; return_reason: string | null }>(
      MEMBER_1,
      "select status, return_reason from public.purchase_requests where id = $1",
      [id],
    );
    expect(seen).toEqual({ status: "returned", return_reason: "Уточніть кількість" });

    const row = await requestRow(id);
    expect(row.decided_by).toBe(MARIA);
    expect(row.decided_at).not.toBeNull();
    // Повернення не вирішує рядків: статуси рядків лишаються порожніми.
    expect(await lineStatuses(id)).toEqual([null, null]);
  });

  it("AC-DEC-06: повернення без причини чи з причиною з пробілів — NO_REASON, заявка лишається «pending», нічого не змінено", async () => {
    const id = await submit(MEMBER_1);
    for (const reason of [null, "", "   "]) {
      await expect(decide(MARIA, id, "return", reason)).rejects.toThrow(/NO_REASON/);
      await expectUnchanged(id);
    }
  });

  it("причину повернення збережено без пробілів по краях", async () => {
    const id = await submit(MEMBER_1);
    await decide(MARIA, id, "return", "  Уточніть кількість  ");
    expect((await requestRow(id)).return_reason).toBe("Уточніть кількість");
  });

  it("автор не повертає власну заявку — OWN_REQUEST, нічого не змінено", async () => {
    await t.asService("insert into public.department_members (department_id, profile_id, is_approver) values ($1, $2, true)", [
      dept["Вища школа"],
      MARIA,
    ]);
    const own = await submit(MARIA, "Вища школа");
    await expect(decide(MARIA, own, "return", "Уточніть кількість")).rejects.toThrow(/OWN_REQUEST/);
    await expectUnchanged(own);
  });

  it("схвалювач іншого відділу й заявник — FORBIDDEN, нічого не змінено", async () => {
    const id = await submit(MEMBER_1);
    await expect(decide(PETRO, id, "return", "Уточніть кількість")).rejects.toThrow(/FORBIDDEN/);
    await expectUnchanged(id);
    await expect(decide(MEMBER_1, id, "return", "Уточніть кількість")).rejects.toThrow(/FORBIDDEN/);
    await expectUnchanged(id);
  });

  it("вже вирішену чи вже повернену заявку не повертають — NOT_PENDING, дані не змінено", async () => {
    const approved = await submit(MEMBER_1);
    await decide(MARIA, approved, "approve", null);
    await expect(decide(MARIA, approved, "return", "Уточніть кількість")).rejects.toThrow(/NOT_PENDING/);
    expect(await requestRow(approved)).toMatchObject({ status: "approved", return_reason: null });

    const returned = await submit(MEMBER_1);
    await decide(MARIA, returned, "return", "Перша причина");
    await expect(decide(MARIA, returned, "return", "Друга причина")).rejects.toThrow(/NOT_PENDING/);
    expect(await requestRow(returned)).toMatchObject({ status: "returned", return_reason: "Перша причина" });
  });

  it("повернення з позначеними рядками — INVALID_DECISION, нічого не змінено", async () => {
    const id = await submit(MEMBER_1);
    await expect(decide(MARIA, id, "return", "Уточніть кількість", [2])).rejects.toThrow(/INVALID_DECISION/);
    await expectUnchanged(id);
  });

  it("причина рівно з 500 символів зберігається, з 501 — відмова обмеження довжини, нічого не змінено", async () => {
    const ok = await submit(MEMBER_1);
    await decide(MARIA, ok, "return", "я".repeat(500));
    expect((await requestRow(ok)).return_reason).toHaveLength(500);

    const tooLong = await submit(MEMBER_1);
    await expect(decide(MARIA, tooLong, "return", "я".repeat(501))).rejects.toThrow(/purchase_requests_return_reason_length/);
    await expectUnchanged(tooLong);
  });

  it("заявка «returned» без причини неможлива навіть в обхід функції — check-обмеження", async () => {
    const id = await submit(MEMBER_1);
    for (const reason of [null, "   "]) {
      await expect(
        t.asService("update public.purchase_requests set status = 'returned', return_reason = $2 where id = $1", [id, reason]),
      ).rejects.toThrow(/check constraint/);
    }
    await expectUnchanged(id);
  });

  it("причину повернення не змінити напряму, оминаючи функцію — permission denied", async () => {
    const id = await submit(MEMBER_1);
    for (const user of [MARIA, MEMBER_1]) {
      await expect(
        t.asUser(user, "update public.purchase_requests set return_reason = 'Підмінено' where id = $1", [id]),
      ).rejects.toThrow(/permission denied/);
    }
    await expectUnchanged(id);
  });

  // Рев'ю CodeRabbit (PR 61): обмеження додано «not valid» і перевірено окремою міграцією — після неї вони звичайні.
  it("обмеження причини повернення перевірено (validated) окремою міграцією", async () => {
    const rows = await t.asService<{ conname: string; convalidated: boolean }>(
      `select conname, convalidated from pg_constraint
        where conname in ('purchase_requests_return_reason_length', 'purchase_requests_return_reason_check') order by conname`,
    );
    expect(rows).toEqual([
      { conname: "purchase_requests_return_reason_check", convalidated: true },
      { conname: "purchase_requests_return_reason_length", convalidated: true },
    ]);
  });
});
