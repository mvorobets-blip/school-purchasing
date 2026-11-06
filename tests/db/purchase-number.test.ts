// Тести бази (PGlite) для номера заявки й меж чисел рядка (impl-purchase-history, задача 1).
// Окрема свіжа база: AC-HIST-01 вимагає, щоб на початку не було жодної закупівлі.
import { beforeAll, describe, expect, it } from "vitest";
import { formatRequestNumber } from "@/lib/purchase/number";
import { createTestDb, type TestDb } from "./supabase-pglite";

let t: TestDb;
let MEMBER_1: string; // «працівник 1»: заявник «Початкової школи»
const dept: Record<string, string> = {};

const LINE = { name: "Папір А4", purpose: "Для друку", quantity: 3, price: "20.00" };

const submit = (lines: unknown) =>
  t.asUser<{ id: string }>(MEMBER_1, "select public.submit_purchase($1, $2, $3::jsonb) as id", [
    dept["Початкова школа"],
    "purchasing_department",
    JSON.stringify(lines),
  ]);

const requestCount = async () => {
  const [row] = await t.asService<{ n: number }>("select count(*)::int as n from public.purchase_requests");
  return row.n;
};

const numberOf = async (id: string) => {
  const [row] = await t.asService<{ number: number }>("select number from public.purchase_requests where id = $1", [id]);
  return row.number;
};

beforeAll(async () => {
  t = await createTestDb();
  MEMBER_1 = t.users["member1@example.test"];
  for (const d of await t.asService<{ id: string; name: string }>("select id, name from public.departments")) {
    dept[d.name] = d.id;
  }
  await t.asService("insert into public.department_members (department_id, profile_id, is_approver) values ($1, $2, false)", [
    dept["Початкова школа"],
    MEMBER_1,
  ]);
}, 60_000);

describe("номер заявки (база)", () => {
  it("AC-HIST-01: у порожній базі перша й друга закупівлі працівника 1 отримують номери 1 і 2 — «PUR-1» і «PUR-2»", async () => {
    expect(await requestCount()).toBe(0);
    const [{ id: first }] = await submit([LINE]);
    const [{ id: second }] = await submit([LINE]);
    const mine = await t.asUser<{ id: string; number: number }>(
      MEMBER_1,
      "select id, number from public.purchase_requests where author_id = (select auth.uid()) order by number",
    );
    expect(mine).toEqual([
      { id: first, number: 1 },
      { id: second, number: 2 },
    ]);
    expect(mine.map((r) => formatRequestNumber(r.number))).toEqual(["PUR-1", "PUR-2"]);
  });

  it("номер не повторюється після видалення заявки: наступна отримує max + 1", async () => {
    const [{ id: a }] = await submit([LINE]);
    const [{ id: b }] = await submit([LINE]);
    const last = await numberOf(b);
    expect(last).toBe((await numberOf(a)) + 1);
    await t.asService("delete from public.purchase_requests where id = $1", [b]);
    const [{ id: c }] = await submit([LINE]);
    expect(await numberOf(c)).toBe(last + 1);
  });

  it("номер обов'язковий і унікальний: прямий insert service role з наявним номером відхилено", async () => {
    const [{ id }] = await submit([LINE]);
    const taken = await numberOf(id);
    const before = await requestCount();
    await expect(
      t.asService(
        "insert into public.purchase_requests (author_id, department_id, purchase_type, number) values ($1, $2, 'purchasing_department', $3)",
        [MEMBER_1, dept["Початкова школа"], taken],
      ),
    ).rejects.toThrow(/unique|duplicate/i);
    expect(await requestCount()).toBe(before);
  });
});

describe("межі кількості й ціни в рядку (база)", () => {
  const line = (quantity: unknown, price: unknown) => [{ name: "Папір А4", purpose: "Друк", quantity, price }];

  it("кількість не ціла чи менша за 1 (1.5, 0, -1) — INVALID_QUANTITY, нової заявки немає", async () => {
    for (const quantity of ["1.5", "0", "-1", 1.5, 0]) {
      const before = await requestCount();
      await expect(submit(line(quantity, "20.00"))).rejects.toThrow(/INVALID_QUANTITY/);
      expect(await requestCount()).toBe(before);
    }
  });

  it("ціна від'ємна чи не число — INVALID_PRICE, нової заявки немає", async () => {
    for (const price of ["-1", "-0.01", "abc"]) {
      const before = await requestCount();
      await expect(submit(line(2, price))).rejects.toThrow(/INVALID_PRICE/);
      expect(await requestCount()).toBe(before);
    }
  });

  it("помилка в другому рядку — не створено ні заявки, ні рядків першого", async () => {
    const before = await requestCount();
    const [{ n: linesBefore }] = await t.asService<{ n: number }>("select count(*)::int as n from public.purchase_request_lines");
    await expect(submit([LINE, { ...LINE, quantity: "1.5" }])).rejects.toThrow(/INVALID_QUANTITY/);
    expect(await requestCount()).toBe(before);
    const [{ n: linesAfter }] = await t.asService<{ n: number }>("select count(*)::int as n from public.purchase_request_lines");
    expect(linesAfter).toBe(linesBefore);
  });

  it("порожнє поле — як і раніше INVALID_LINE, а не INVALID_QUANTITY чи INVALID_PRICE", async () => {
    await expect(submit(line("", "20.00"))).rejects.toThrow(/INVALID_LINE/);
    await expect(submit(line(2, ""))).rejects.toThrow(/INVALID_LINE/);
  });

  it("ціна 0 і ціла кількість 2 — заявку прийнято з номером", async () => {
    const before = await requestCount();
    const [{ id }] = await submit(line("2", "0"));
    expect(await requestCount()).toBe(before + 1);
    const [saved] = await t.asService<{ quantity: string; price: string }>(
      "select quantity::text as quantity, price::text as price from public.purchase_request_lines where request_id = $1",
      [id],
    );
    expect(Number(saved.quantity)).toBe(2);
    expect(Number(saved.price)).toBe(0);
    expect(await numberOf(id)).toBeGreaterThan(0);
  });
});
