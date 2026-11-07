// Backfill номерів на непорожній базі (як прод): наявним заявкам номери за датою подання, найстаріша — 1, а нова заявка
// отримує наступний номер (відповідь PM ValiaBihun/2026-quitcode-dream-team#73). Регресійний тест без AC ID: AC-HIST-01
// доводить порожня база (tests/db/purchase-number.test.ts).
import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "./supabase-pglite";

const MIGRATION = "20261106162407_request_number_and_line_limits.sql";
let t: TestDb;
let MEMBER_1: string;
let deptId: string;
const ids: Record<string, string> = {};

beforeAll(async () => {
  t = await createTestDb({ stopBefore: MIGRATION });
  MEMBER_1 = t.users["member1@example.test"];
  [{ id: deptId }] = await t.asService<{ id: string }>("select id from public.departments where name = 'Початкова школа'");
  await t.asService("insert into public.department_members (department_id, profile_id) values ($1, $2)", [deptId, MEMBER_1]);
  // Вставляємо «старі» заявки не в порядку дат; одна з довгою причиною відхилення (> 500 — до обмеження «not valid»).
  for (const [key, createdAt] of [["c", "2026-10-30T10:00:00Z"], ["a", "2026-10-26T09:00:00Z"], ["b", "2026-10-28T12:00:00Z"]]) {
    const [{ id }] = await t.asService<{ id: string }>(
      `insert into public.purchase_requests (author_id, department_id, purchase_type, created_at)
       values ($1, $2, 'purchasing_department', $3) returning id`,
      [MEMBER_1, deptId, createdAt],
    );
    ids[key] = id;
  }
  // DDL — від власника схеми (як міграції), не service_role.
  await t.db.exec("alter table public.purchase_requests drop constraint purchase_requests_reject_reason_length");
  await t.asService(
    "update public.purchase_requests set status = 'rejected', reject_reason = repeat('x', 600) where id = $1",
    [ids.b],
  );
  await t.db.exec(
    `alter table public.purchase_requests add constraint purchase_requests_reject_reason_length
       check (reject_reason is null or char_length(reject_reason) <= 500) not valid`,
  );
  await t.applyRemaining();
}, 60_000);

describe("номери наявних заявок (backfill)", () => {
  it("наявним заявкам номери за датою подання: найстаріша — 1; довга стара причина відхилення міграції не заважає", async () => {
    const rows = await t.asService<{ id: string; number: number }>("select id, number from public.purchase_requests");
    const numberOf = Object.fromEntries(rows.map((r) => [r.id, r.number]));
    expect([numberOf[ids.a], numberOf[ids.b], numberOf[ids.c]]).toEqual([1, 2, 3]);
  });

  it("нова заявка після backfill отримує наступний номер (max + 1)", async () => {
    const [{ id }] = await t.asUser<{ id: string }>(MEMBER_1, "select public.submit_purchase($1, 'purchasing_department', $2::jsonb) as id", [
      deptId,
      JSON.stringify([{ name: "Папір А4", purpose: "Для друку", quantity: 3, price: "20.00" }]),
    ]);
    const [row] = await t.asService<{ number: number }>("select number from public.purchase_requests where id = $1", [id]);
    expect(row.number).toBe(4);
  });

  it("обмеження довжини причини відхилення лишилось (not valid) і перевіряє нові записи", async () => {
    await expect(
      t.asService("update public.purchase_requests set reject_reason = repeat('y', 501) where id = $1", [ids.a]),
    ).rejects.toThrow(/purchase_requests_reject_reason_length/);
  });
});
