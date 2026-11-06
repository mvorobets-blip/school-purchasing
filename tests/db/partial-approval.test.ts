// Тести бази (PGlite) для часткового схвалення: public.decide_purchase з p_rejected_positions і статус рядків заявки.
// Кожен відмовний тест перевіряє і відмову, і незмінні дані (статус заявки «pending», статуси рядків — null).
import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "./supabase-pglite";

let t: TestDb;
let MEMBER_1: string; // «працівник 1» — заявник «Початкової школи», автор заявок із трьома рядками
let MARIA: string; // «Марія» — схвалювач лише «Початкової школи»
let PETRO: string; // схвалювач лише «Офісу» — для відмови «чужий відділ»
const dept: Record<string, string> = {};
const THREE_LINES = JSON.stringify([
  { name: "Папір А4", purpose: "Для друку", quantity: 3, price: "20.00" },
  { name: "Маркери", purpose: "Для дошки", quantity: 2, price: "15.50" },
  { name: "Скріпки", purpose: "Для документів", quantity: 5, price: "1.00" },
]);

const submit = async (user: string, department = "Початкова школа") => {
  const [row] = await t.asUser<{ id: string }>(
    user,
    "select public.submit_purchase($1, 'purchasing_department', $2::jsonb) as id",
    [dept[department], THREE_LINES],
  );
  return row.id;
};
// Рішення з позначеними рядками (1-based position) — нова сигнатура.
const decide = (user: string, id: string, decision: string, reason: string | null, positions: number[]) =>
  t.asUser(user, "select public.decide_purchase($1, $2, $3, $4::integer[])", [id, decision, reason, positions]);
// Стара форма виклику з трьома аргументами — має працювати через default '{}'.
const decide3 = (user: string, id: string, decision: string, reason: string | null = null) =>
  t.asUser(user, "select public.decide_purchase($1, $2, $3)", [id, decision, reason]);
const requestStatus = async (id: string) => {
  const [row] = await t.asService<{ status: string }>("select status from public.purchase_requests where id = $1", [id]);
  return row.status;
};
// Статуси рядків очима користувача (RLS) або в обхід RLS.
const lineStatuses = (rows: { position: number; status: string | null }[]) =>
  Object.fromEntries(rows.map((r) => [r.position, r.status]));
const linesAsService = async (id: string) =>
  lineStatuses(
    await t.asService<{ position: number; status: string | null }>(
      "select position, status from public.purchase_request_lines where request_id = $1 order by position",
      [id],
    ),
  );
const UNDECIDED = { 1: null, 2: null, 3: null };
// Нічого не змінено: заявка «pending», рядки не вирішені.
const expectUnchanged = async (id: string) => {
  expect(await requestStatus(id)).toBe("pending");
  expect(await linesAsService(id)).toEqual(UNDECIDED);
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

describe("часткове схвалення (база)", () => {
  it("AC-DEC-01: Марія відхиляє рядок 2 і схвалює — заявка «Частково схвалено», автор бачить рядок 2 «Відхилено», 1 і 3 «Схвалено»", async () => {
    const id = await submit(MEMBER_1);
    await decide(MARIA, id, "approve", null, [2]);

    // Автор бачить статус заявки й рядків під своїм RLS.
    const [request] = await t.asUser<{ status: string }>(MEMBER_1, "select status from public.purchase_requests where id = $1", [
      id,
    ]);
    expect(request.status).toBe("partially_approved");
    const lines = await t.asUser<{ position: number; status: string | null }>(
      MEMBER_1,
      "select position, status from public.purchase_request_lines where request_id = $1 order by position",
      [id],
    );
    expect(lineStatuses(lines)).toEqual({ 1: "approved", 2: "rejected", 3: "approved" });
  });

  // Регресія AC-APR-02 під новим правилом («Схвалено» — лише без відхилених рядків): той самий сценарій PM, тож ID AC
  // лишається; мутант «partially_approved замість approved без позначених» (tasks.md 3.4) робить його червоним.
  it("AC-APR-02: схвалення без відхилених рядків — заявка «Схвалено», усі рядки «Схвалено» (і виклик із трьома аргументами)", async () => {
    const id = await submit(MEMBER_1);
    await decide(MARIA, id, "approve", null, []);
    expect(await requestStatus(id)).toBe("approved");
    expect(await linesAsService(id)).toEqual({ 1: "approved", 2: "approved", 3: "approved" });

    const old = await submit(MEMBER_1);
    await decide3(MARIA, old, "approve");
    expect(await requestStatus(old)).toBe("approved");
    expect(await linesAsService(old)).toEqual({ 1: "approved", 2: "approved", 3: "approved" });
  });

  it("усі рядки позначено відхиленими — ALL_LINES_REJECTED, нічого не змінено", async () => {
    const id = await submit(MEMBER_1);
    await expect(decide(MARIA, id, "approve", null, [1, 2, 3])).rejects.toThrow(/ALL_LINES_REJECTED/);
    await expectUnchanged(id);
  });

  it("позиція поза заявкою — INVALID_LINE, нічого не змінено", async () => {
    const id = await submit(MEMBER_1);
    await expect(decide(MARIA, id, "approve", null, [4])).rejects.toThrow(/INVALID_LINE/);
    await expectUnchanged(id);
    await expect(decide(MARIA, id, "approve", null, [0])).rejects.toThrow(/INVALID_LINE/);
    await expectUnchanged(id);
  });

  it("автор не вирішує власну заявку з відхиленими рядками — OWN_REQUEST, нічого не змінено", async () => {
    await t.asService("insert into public.department_members (department_id, profile_id, is_approver) values ($1, $2, true)", [
      dept["Вища школа"],
      MARIA,
    ]);
    const own = await submit(MARIA, "Вища школа");
    await expect(decide(MARIA, own, "approve", null, [2])).rejects.toThrow(/OWN_REQUEST/);
    await expectUnchanged(own);
  });

  it("схвалювач іншого відділу й заявник — FORBIDDEN, нічого не змінено", async () => {
    const id = await submit(MEMBER_1);
    await expect(decide(PETRO, id, "approve", null, [2])).rejects.toThrow(/FORBIDDEN/);
    await expectUnchanged(id);
    await expect(decide(MEMBER_1, id, "approve", null, [2])).rejects.toThrow(/FORBIDDEN/);
    await expectUnchanged(id);
  });

  it("вже вирішену заявку не вирішують удруге — NOT_PENDING, статуси рядків не змінено", async () => {
    const id = await submit(MEMBER_1);
    await decide(MARIA, id, "approve", null, []);
    await expect(decide(MARIA, id, "approve", null, [2])).rejects.toThrow(/NOT_PENDING/);
    expect(await requestStatus(id)).toBe("approved");
    expect(await linesAsService(id)).toEqual({ 1: "approved", 2: "approved", 3: "approved" });
  });

  it("відхилення заявки з позначеними рядками — INVALID_DECISION, нічого не змінено", async () => {
    const id = await submit(MEMBER_1);
    await expect(decide(MARIA, id, "reject", "Немає бюджету", [2])).rejects.toThrow(/INVALID_DECISION/);
    await expectUnchanged(id);
  });

  it("відхилення заявки з причиною без позначених рядків — «rejected», як раніше", async () => {
    const id = await submit(MEMBER_1);
    await decide(MARIA, id, "reject", "Немає бюджету", []);
    expect(await requestStatus(id)).toBe("rejected");
  });

  it("статус рядка не змінити напряму, оминаючи функцію — permission denied", async () => {
    const id = await submit(MEMBER_1);
    for (const user of [MARIA, MEMBER_1]) {
      await expect(
        t.asUser(user, "update public.purchase_request_lines set status = 'rejected' where request_id = $1", [id]),
      ).rejects.toThrow(/permission denied/);
    }
    await expectUnchanged(id);
  });
});
