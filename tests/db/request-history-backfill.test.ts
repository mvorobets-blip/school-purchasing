// Backfill історії на непорожній базі (як прод): кожна наявна заявка отримує рівно один запис «Подано» з автором і
// датою подання — зокрема заявка деактивованого автора. Регресійний тест без AC ID: AC-HIST-06 доводить нове подання
// (tests/db/request-history.test.ts).
import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "./supabase-pglite";

const MIGRATION = "20261106184819_request_history.sql";
let t: TestDb;
let MEMBER_1: string;
let MEMBER_2: string;
const ids: Record<string, string> = {};

beforeAll(async () => {
  t = await createTestDb({ stopBefore: MIGRATION });
  MEMBER_1 = t.users["member1@example.test"];
  MEMBER_2 = t.users["member2@example.test"];
  const [{ id: deptId }] = await t.asService<{ id: string }>("select id from public.departments where name = 'Початкова школа'");
  for (const [key, author, createdAt, number] of [
    ["active", MEMBER_1, "2026-10-26T09:00:00Z", 1],
    ["deactivated", MEMBER_2, "2026-10-28T12:00:00Z", 2],
  ] as const) {
    const [{ id }] = await t.asService<{ id: string }>(
      `insert into public.purchase_requests (author_id, department_id, purchase_type, created_at, number)
       values ($1, $2, 'purchasing_department', $3, $4) returning id`,
      [author, deptId, createdAt, number],
    );
    ids[key] = id;
  }
  await t.asService("update public.profiles set is_active = false where id = $1", [MEMBER_2]);
  await t.applyRemaining();
}, 60_000);

describe("історія наявних заявок (backfill)", () => {
  it("кожна наявна заявка має рівно один запис submitted з автором і датою подання", async () => {
    const events = await t.asService<{ request_id: string; kind: string; actor_id: string; created_at: string }>(
      "select request_id, kind, actor_id, created_at::text from public.purchase_request_events order by created_at",
    );
    expect(events).toHaveLength(2);
    expect(events.map((e) => [e.request_id, e.kind, e.actor_id])).toEqual([
      [ids.active, "submitted", MEMBER_1],
      [ids.deactivated, "submitted", MEMBER_2],
    ]);
    const requests = await t.asService<{ id: string; created_at: string }>(
      "select id, created_at::text from public.purchase_requests order by created_at",
    );
    expect(events.map((e) => e.created_at)).toEqual(requests.map((r) => r.created_at));
  });

  it("автор бачить запис «Подано» своєї старої заявки через request_history", async () => {
    const rows = await t.asUser<{ kind: string; actor_name: string }>(
      MEMBER_1,
      "select kind, actor_name from public.request_history($1::uuid)",
      [ids.active],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe("submitted");
  });
});
