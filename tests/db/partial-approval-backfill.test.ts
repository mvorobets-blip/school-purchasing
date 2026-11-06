// Рядки заявок, схвалених до міграції часткового схвалення (зріз 2), — «approved», як у нових схвалених; рядки заявок
// «Очікує схвалення» й «Відхилено» — без статусу. Регресійний тест без AC ID (рев'ю задачі 3).
import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "./supabase-pglite";

let t: TestDb;
const ids: Record<string, string> = {};

beforeAll(async () => {
  t = await createTestDb({ stopBefore: "20261106190909_partial_approval.sql" });
  const member = t.users["member1@example.test"];
  const [{ id: deptId }] = await t.asService<{ id: string }>("select id from public.departments where name = 'Початкова школа'");
  for (const [key, status, reason, number] of [
    ["approved", "approved", null, 1],
    ["pending", "pending", null, 2],
    ["rejected", "rejected", "Немає бюджету", 3],
  ] as const) {
    const [{ id }] = await t.asService<{ id: string }>(
      `insert into public.purchase_requests (author_id, department_id, purchase_type, status, reject_reason, number)
       values ($1, $2, 'purchasing_department', $3, $4, $5) returning id`,
      [member, deptId, status, reason, number],
    );
    await t.asService(
      "insert into public.purchase_request_lines (request_id, position, name, purpose, quantity, price) values ($1, 1, 'Папір', 'Друк', 1, 1), ($1, 2, 'Маркери', 'Дошка', 2, 3)",
      [id],
    );
    ids[key] = id;
  }
  await t.applyRemaining();
}, 60_000);

describe("статуси рядків наявних заявок (backfill)", () => {
  it("схвалена до міграції — усі рядки approved; очікує чи відхилена — без статусу", async () => {
    const statuses = async (id: string) =>
      (await t.asService<{ status: string | null }>(
        "select status from public.purchase_request_lines where request_id = $1 order by position",
        [id],
      )).map((r) => r.status);
    expect(await statuses(ids.approved)).toEqual(["approved", "approved"]);
    expect(await statuses(ids.pending)).toEqual([null, null]);
    expect(await statuses(ids.rejected)).toEqual([null, null]);
  });
});
