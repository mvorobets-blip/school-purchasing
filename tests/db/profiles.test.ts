// Тести бази (PGlite) для профілю: пастка «update own row + role» (рубрика WS7, C). Політика profiles_update_own
// дозволяє оновлювати власний рядок, тому захищає лише column grant: authenticated має `grant update (full_name)`.
import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "./supabase-pglite";

let t: TestDb;
let MEMBER_1: string;

const profileOf = async (id: string) => {
  const [row] = await t.asService<{ role: string; is_active: boolean; full_name: string | null }>(
    "select role, is_active, full_name from public.profiles where id = $1",
    [id],
  );
  return row;
};

beforeAll(async () => {
  t = await createTestDb();
  MEMBER_1 = t.users["member1@example.test"];
}, 60_000);

describe("профіль: працівник не підвищує собі роль", () => {
  it("власний рядок: зміна role відхилена (немає column grant), роль не змінилась", async () => {
    const before = await profileOf(MEMBER_1);
    await expect(
      t.asUser(MEMBER_1, "update public.profiles set role = 'admin' where id = (select auth.uid())"),
    ).rejects.toThrow(/permission denied/);
    expect((await profileOf(MEMBER_1)).role).toBe(before.role);
  });

  it("власний рядок: зміна is_active відхилена, активність не змінилась", async () => {
    await expect(
      t.asUser(MEMBER_1, "update public.profiles set is_active = false where id = (select auth.uid())"),
    ).rejects.toThrow(/permission denied/);
    expect((await profileOf(MEMBER_1)).is_active).toBe(true);
  });

  it("власне ім'я змінити можна — це єдина колонка з grant update", async () => {
    await t.asUser(MEMBER_1, "update public.profiles set full_name = 'Андрій Демо-Оновлений' where id = (select auth.uid())");
    expect((await profileOf(MEMBER_1)).full_name).toBe("Андрій Демо-Оновлений");
  });
});
