// public.can_decide_purchase: сторінка заявки показує «Reject line» і кнопки рішення лише тому, хто справді може вирішити
// (схвалювач відділу заявки, не автор, «Очікує схвалення»). Регресійний тест без AC ID: саме рішення й відмови доводять
// tests/db/partial-approval.test.ts і tests/db/approval.test.ts. Тест дописав розробник (функцію додано після тестів задачі 3).
import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "./supabase-pglite";

let t: TestDb;
let MEMBER_1: string;
let MARIA: string;
let PETRO: string;
let requestId: string;

const canDecide = async (user: string, id: string) => {
  const [row] = await t.asUser<{ ok: boolean }>(user, "select public.can_decide_purchase($1::uuid) as ok", [id]);
  return row.ok;
};

beforeAll(async () => {
  t = await createTestDb();
  MEMBER_1 = t.users["member1@example.test"];
  MARIA = t.users["member2@example.test"];
  PETRO = t.users["pm-approver@example.test"];
  const dept: Record<string, string> = {};
  for (const d of await t.asService<{ id: string; name: string }>("select id, name from public.departments")) dept[d.name] = d.id;
  await t.asService(
    `insert into public.department_members (department_id, profile_id, is_approver)
       values ($1, $2, false), ($1, $3, true), ($4, $5, true)`,
    [dept["Початкова школа"], MEMBER_1, MARIA, dept["Офіс"], PETRO],
  );
  [{ id: requestId }] = await t.asUser<{ id: string }>(MEMBER_1, "select public.submit_purchase($1, 'purchasing_department', $2::jsonb) as id", [
    dept["Початкова школа"],
    JSON.stringify([{ name: "Папір А4", purpose: "Для друку", quantity: 3, price: "20.00" }]),
  ]);
}, 60_000);

describe("чи може користувач вирішити заявку", () => {
  it("схвалювач відділу заявки — так; автор, схвалювач іншого відділу — ні", async () => {
    expect(await canDecide(MARIA, requestId)).toBe(true);
    expect(await canDecide(MEMBER_1, requestId)).toBe(false);
    expect(await canDecide(PETRO, requestId)).toBe(false);
  });

  it("після рішення — ні; гість функції не викликає", async () => {
    await t.asUser(MARIA, "select public.decide_purchase($1::uuid, 'approve')", [requestId]);
    expect(await canDecide(MARIA, requestId)).toBe(false);
    await expect(t.asAnon("select public.can_decide_purchase($1::uuid)", [requestId])).rejects.toThrow(/permission denied/);
  });
});
