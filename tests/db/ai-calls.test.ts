// Тести бази (PGlite) для журналу AI-помічника public.ai_calls (WS11, SLO-2 PM #83): хто читає, хто пише, що можна
// записати й скільки зберігається. Технічні тести — без AC ID (SLO PM — не AC). Кожен відмовний тест перевіряє і
// відмову, і незмінний стан (asService).
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "./supabase-pglite";

let t: TestDb;
let ADMIN: string;
let MEMBER_1: string;
let MEMBER_2: string;

const COLUMNS = "state, app_state, error_kind, model, fallback_used, model_called, latency_ms, input_tokens, output_tokens, prompt_version, request_id";
const row = (over: Record<string, unknown> = {}) => ({
  state: "ok",
  app_state: "line",
  error_kind: null,
  model: "google/gemma-4-31b-it:free",
  fallback_used: false,
  model_called: true,
  latency_ms: 1830,
  input_tokens: 612,
  output_tokens: 144,
  prompt_version: "line-v4",
  request_id: randomUUID(),
  ...over,
});
const insertAs = (user: string, values: Record<string, unknown>) => {
  const v = values as ReturnType<typeof row>;
  return t.asUser(user, `insert into public.ai_calls (${COLUMNS}) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`, [
    v.state, v.app_state, v.error_kind, v.model, v.fallback_used, v.model_called, v.latency_ms, v.input_tokens, v.output_tokens,
    v.prompt_version, v.request_id,
  ]);
};
const countByRequest = async (requestId: string) => {
  const [r] = await t.asService<{ n: number }>("select count(*)::int as n from public.ai_calls where request_id = $1", [requestId]);
  return r.n;
};

beforeAll(async () => {
  t = await createTestDb();
  ADMIN = t.users["admin@example.test"];
  MEMBER_1 = t.users["member1@example.test"];
  MEMBER_2 = t.users["member2@example.test"];
});

describe("public.ai_calls", () => {
  it("працівник пише рядок про свій запит: user_id і created_at ставить база", async () => {
    const r = row();
    await insertAs(MEMBER_1, r);
    const [saved] = await t.asService<{ user_id: string; created_at: Date; state: string }>(
      "select user_id, created_at, state from public.ai_calls where request_id = $1",
      [r.request_id],
    );
    expect(saved.user_id).toBe(MEMBER_1);
    expect(saved.state).toBe("ok");
    expect(Date.now() - new Date(saved.created_at).getTime()).toBeLessThan(60_000);
  });

  it("підробити автора чи час не можна: колонок user_id і created_at немає в grant insert", async () => {
    const id = randomUUID();
    await expect(
      t.asUser(MEMBER_1, "insert into public.ai_calls (user_id, state, app_state, model_called, latency_ms, prompt_version, request_id) values ($1,'ok','line',true,1,'line-v4',$2)", [MEMBER_2, id]),
    ).rejects.toThrow(/permission denied/);
    await expect(
      t.asUser(MEMBER_1, "insert into public.ai_calls (created_at, state, app_state, model_called, latency_ms, prompt_version, request_id) values (now() - interval '1 year','ok','line',true,1,'line-v4',$1)", [id]),
    ).rejects.toThrow(/permission denied/);
    expect(await countByRequest(id)).toBe(0);
  });

  it("гість не пише й не читає", async () => {
    const r = row();
    await expect(
      t.asAnon(`insert into public.ai_calls (state, app_state, model_called, latency_ms, prompt_version, request_id) values ('ok','line',true,1,'line-v4',$1)`, [r.request_id]),
    ).rejects.toThrow(/permission denied/);
    await expect(t.asAnon("select * from public.ai_calls")).rejects.toThrow(/permission denied/);
    expect(await countByRequest(r.request_id)).toBe(0);
  });

  it("читає лише адміністратор; працівник не бачить навіть власних рядків", async () => {
    await insertAs(MEMBER_2, row());
    const asAdmin = await t.asUser<{ n: number }>(ADMIN, "select count(*)::int as n from public.ai_calls");
    expect(asAdmin[0].n).toBeGreaterThanOrEqual(2);
    const asMember = await t.asUser(MEMBER_1, "select * from public.ai_calls");
    expect(asMember).toEqual([]);
  });

  it("змінити чи видалити рядок не може ніхто з authenticated, навіть адміністратор", async () => {
    const r = row();
    await insertAs(MEMBER_1, r);
    await expect(t.asUser(ADMIN, "update public.ai_calls set state = 'unavailable' where request_id = $1", [r.request_id])).rejects.toThrow(
      /permission denied/,
    );
    await expect(t.asUser(ADMIN, "delete from public.ai_calls where request_id = $1", [r.request_id])).rejects.toThrow(/permission denied/);
    const [saved] = await t.asService<{ state: string }>("select state from public.ai_calls where request_id = $1", [r.request_id]);
    expect(saved.state).toBe("ok");
  });

  it("лише дозволені значення: стан, стан застосунку, код причини, модель, невід'ємні числа", async () => {
    for (const bad of [
      { state: "great" },
      { app_state: "line; drop table" },
      { error_kind: "Rate limit exceeded for user olena@example.test" },
      { model: "gemma with spaces" },
      { latency_ms: -1 },
      { input_tokens: -5 },
      { prompt_version: "" },
    ]) {
      const r = row(bad);
      await expect(insertAs(MEMBER_1, r)).rejects.toThrow(/violates check constraint/);
      expect(await countByRequest(r.request_id)).toBe(0);
    }
  });

  it("один рядок на запит: повтор request_id відхиляється", async () => {
    const r = row();
    await insertAs(MEMBER_1, r);
    await expect(insertAs(MEMBER_1, r)).rejects.toThrow(/duplicate key/);
    expect(await countByRequest(r.request_id)).toBe(1);
  });

  it("зберігання 35 днів: після нової вставки рядки, старіші за 35 днів, видалено, а 34-денні лишились", async () => {
    const old = randomUUID();
    const recent = randomUUID();
    await t.asService(
      `insert into public.ai_calls (user_id, created_at, state, app_state, model_called, latency_ms, prompt_version, request_id) values
       ($1, now() - interval '36 days', 'ok', 'line', true, 1, 'line-v4', $2),
       ($1, now() - interval '34 days', 'ok', 'line', true, 1, 'line-v4', $3)`,
      [MEMBER_1, old, recent],
    );
    // Вставка сервісом теж запускає тригер — тож перевіряємо саме ефект наступної вставки працівника.
    await insertAs(MEMBER_2, row());
    expect(await countByRequest(old)).toBe(0);
    expect(await countByRequest(recent)).toBe(1);
  });

  it("деактивований працівник не пише", async () => {
    await t.asService("update public.profiles set is_active = false where id = $1", [MEMBER_2]);
    const r = row();
    await expect(insertAs(MEMBER_2, r)).rejects.toThrow(/row-level security/);
    expect(await countByRequest(r.request_id)).toBe(0);
    await t.asService("update public.profiles set is_active = true where id = $1", [MEMBER_2]);
  });
});
