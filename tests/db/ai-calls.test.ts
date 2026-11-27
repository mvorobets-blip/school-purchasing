// Тести бази (PGlite) для журналу AI-помічника public.ai_calls (WS11, SLO-2 PM #83): хто читає, хто пише, що можна
// записати й скільки зберігається. Пише лише функція record_ai_call (відгук викладача WS11, пункт 2): прямої вставки
// в таблицю немає. Технічні тести — без AC ID (SLO PM — не AC). Кожен відмовний тест перевіряє і
// відмову, і незмінний стан (asService).
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "./supabase-pglite";

let t: TestDb;
let ADMIN: string;
let MEMBER_1: string;
let MEMBER_2: string;
let APPROVER: string;

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
// Так пише застосунок: supabase.rpc("record_ai_call", …) → обгортка public → private.record_ai_call.
const recordAs = (user: string, values: Record<string, unknown>) => {
  const v = values as ReturnType<typeof row>;
  return t.asUser(user, "select public.record_ai_call($11, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10)", [
    v.state, v.app_state, v.error_kind, v.model, v.fallback_used, v.model_called, v.latency_ms, v.input_tokens, v.output_tokens,
    v.prompt_version, v.request_id,
  ]);
};
// Пряма вставка в таблицю — так, як міг би спробувати користувач через PostgREST в обхід server action.
const insertDirect = (user: string, r: ReturnType<typeof row>) =>
  t.asUser(user, `insert into public.ai_calls (${COLUMNS}) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`, [
    r.state, r.app_state, r.error_kind, r.model, r.fallback_used, r.model_called, r.latency_ms, r.input_tokens, r.output_tokens,
    r.prompt_version, r.request_id,
  ]);
const countByRequest = async (requestId: string) => {
  const [r] = await t.asService<{ n: number }>("select count(*)::int as n from public.ai_calls where request_id = $1", [requestId]);
  return r.n;
};

beforeAll(async () => {
  t = await createTestDb();
  ADMIN = t.users["admin@example.test"];
  MEMBER_1 = t.users["member1@example.test"];
  MEMBER_2 = t.users["member2@example.test"];
  APPROVER = t.users["approver-primary@example.test"];
});

describe("public.ai_calls", () => {
  it("працівник пише рядок про свій запит функцією: user_id і created_at ставить база", async () => {
    const r = row();
    await recordAs(MEMBER_1, r);
    const [saved] = await t.asService<{ user_id: string; created_at: Date; state: string }>(
      "select user_id, created_at, state from public.ai_calls where request_id = $1",
      [r.request_id],
    );
    expect(saved.user_id).toBe(MEMBER_1);
    expect(saved.state).toBe("ok");
    expect(Date.now() - new Date(saved.created_at).getTime()).toBeLessThan(60_000);
  });

  it("схвалювач теж пише рядок (помічником користуються requester і approver)", async () => {
    const r = row();
    await recordAs(APPROVER, r);
    expect(await countByRequest(r.request_id)).toBe(1);
  });

  it("пряма вставка в таблицю в обхід функції — 42501, навіть зі «своїм» рядком; рядка немає", async () => {
    // Саме відсутність права insert (revoke), а не RLS: відмова RLS теж має код 42501, тож перевіряємо текст.
    const r = row({ state: "unavailable", app_state: "unavailable" });
    await expect(insertDirect(MEMBER_1, r)).rejects.toThrow(/permission denied for table ai_calls/);
    const id = randomUUID();
    await expect(
      t.asUser(MEMBER_1, "insert into public.ai_calls (user_id, state, app_state, model_called, latency_ms, prompt_version, request_id) values ($1,'ok','line',true,1,'line-v4',$2)", [MEMBER_2, id]),
    ).rejects.toThrow(/permission denied for table ai_calls/);
    await expect(
      t.asUser(MEMBER_1, "insert into public.ai_calls (created_at, state, app_state, model_called, latency_ms, prompt_version, request_id) values (now() - interval '1 year','ok','line',true,1,'line-v4',$1)", [id]),
    ).rejects.toThrow(/permission denied for table ai_calls/);
    expect(await countByRequest(r.request_id)).toBe(0);
    expect(await countByRequest(id)).toBe(0);
  });

  it("адміністратор помічником не користується — і рядка журналу записати не може (42501)", async () => {
    const r = row();
    await expect(recordAs(ADMIN, r)).rejects.toMatchObject({ code: "42501", message: expect.stringMatching(/not allowed/) });
    expect(await countByRequest(r.request_id)).toBe(0);
  });

  it("гість не пише (ні функцією, ні напряму) й не читає", async () => {
    const r = row();
    await expect(
      t.asAnon("select public.record_ai_call($1, 'ok', 'line', null, null, false, true, 1, null, null, 'line-v4')", [r.request_id]),
    ).rejects.toThrow(/permission denied/);
    await expect(
      t.asAnon(`insert into public.ai_calls (state, app_state, model_called, latency_ms, prompt_version, request_id) values ('ok','line',true,1,'line-v4',$1)`, [r.request_id]),
    ).rejects.toThrow(/permission denied/);
    await expect(t.asAnon("select * from public.ai_calls")).rejects.toThrow(/permission denied/);
    expect(await countByRequest(r.request_id)).toBe(0);
  });

  it("читає лише адміністратор; працівник не бачить навіть власних рядків", async () => {
    await recordAs(MEMBER_2, row());
    const asAdmin = await t.asUser<{ n: number }>(ADMIN, "select count(*)::int as n from public.ai_calls");
    expect(asAdmin[0].n).toBeGreaterThanOrEqual(2);
    const asMember = await t.asUser(MEMBER_1, "select * from public.ai_calls");
    expect(asMember).toEqual([]);
  });

  it("змінити чи видалити рядок не може ніхто з authenticated, навіть адміністратор", async () => {
    const r = row();
    await recordAs(MEMBER_1, r);
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
      await expect(recordAs(MEMBER_1, r)).rejects.toThrow(/violates check constraint/);
      expect(await countByRequest(r.request_id)).toBe(0);
    }
  });

  it("один рядок на запит: повтор request_id відхиляється", async () => {
    const r = row();
    await recordAs(MEMBER_1, r);
    await expect(recordAs(MEMBER_1, r)).rejects.toThrow(/duplicate key/);
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
    await recordAs(MEMBER_2, row());
    expect(await countByRequest(old)).toBe(0);
    expect(await countByRequest(recent)).toBe(1);
  });

  it("деактивований працівник не пише", async () => {
    await t.asService("update public.profiles set is_active = false where id = $1", [MEMBER_2]);
    const r = row();
    await expect(recordAs(MEMBER_2, r)).rejects.toMatchObject({ code: "42501", message: expect.stringMatching(/not allowed/) });
    expect(await countByRequest(r.request_id)).toBe(0);
    await t.asService("update public.profiles set is_active = true where id = $1", [MEMBER_2]);
  });
});
