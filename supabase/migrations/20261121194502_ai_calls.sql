-- WS11 (трек B, PM ValiaBihun/2026-quitcode-dream-team#83, SLO-2): журнал AI-помічника «Suggest lines» у базі.
-- SLO-2 — частка запитів за добу, після яких людина бачить пропозицію, а не «The assistant is unavailable today»
-- (AC-AI-05) чи «Could not get a suggestion…» (AC-AI-04), за 28 днів. Журнали Vercel Hobby живуть 1 годину, тож дані —
-- тут: один рядок на запит (зокрема відмову до виклику моделі — model_called = false). Схему погоджено з розробником
-- 21.11 (опис PR). Тексту користувача, промпту й відповіді моделі НЕМАЄ — лише стан, модель, затримка, токени, версія.
-- Доступ: читає лише активний адміністратор; пише server action від імені користувача — лише свій рядок
-- (user_id = auth.uid(), колонку не можна задати: її немає в grant insert), без update/delete.
-- Зберігання — щонайменше 35 днів (28 днів SLO + запас): старіші рядки видаляє тригер під час наступної вставки;
-- поки запитів немає, вони лишаються до першого нового (CodeRabbit PR 100: строк — «не менше», не «рівно»).

-- ── 1. Таблиця ─────────────────────────────────────────────────────────────────
create table public.ai_calls (
  id             bigint generated always as identity primary key,
  created_at     timestamptz not null default now(),
  user_id        uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  state          text not null,
  app_state      text not null,
  error_kind     text,
  model          text,
  fallback_used  boolean not null default false,
  model_called   boolean not null,
  latency_ms     integer not null,
  input_tokens   integer,
  output_tokens  integer,
  prompt_version text not null,
  request_id     uuid not null,
  constraint ai_calls_request_id_key unique (request_id),
  -- Стан для рубрики й журналу llm.call (ok / needs_info / refused / unavailable).
  constraint ai_calls_state_check check (state in ('ok', 'needs_info', 'refused', 'unavailable')),
  -- Стан застосунку (src/lib/ai/suggest.ts): SLO-2 рахує «погані» failed і unavailable.
  constraint ai_calls_app_state_check
    check (app_state in ('line', 'invalid', 'off_topic', 'injection', 'failed', 'unavailable')),
  -- Код причини, ніколи не текст повідомлення про помилку.
  constraint ai_calls_error_kind_check check (error_kind is null or error_kind ~ '^[a-z_]{1,40}$'),
  constraint ai_calls_model_check check (model is null or (char_length(model) <= 120 and model ~ '^[A-Za-z0-9._:/-]+$')),
  constraint ai_calls_latency_check check (latency_ms >= 0),
  constraint ai_calls_tokens_check check ((input_tokens is null or input_tokens >= 0) and (output_tokens is null or output_tokens >= 0)),
  constraint ai_calls_prompt_version_check check (char_length(prompt_version) between 1 and 40)
);

create index ai_calls_created_at_idx on public.ai_calls (created_at);
create index ai_calls_user_id_idx on public.ai_calls (user_id);

comment on table public.ai_calls is
  'Журнал AI-помічника для SLO-2 (PM #83): рядок на запит «Suggest lines», без тексту користувача; від 35 днів (прибирає наступна вставка); читає адміністратор.';

-- ── 2. Права й політики ────────────────────────────────────────────────────────
alter table public.ai_calls enable row level security;
revoke all on table public.ai_calls from anon, authenticated;
grant select on table public.ai_calls to authenticated;
-- Лише ці колонки: id, created_at і user_id задає база (default), тож підробити час чи автора рядка не можна.
grant insert (state, app_state, error_kind, model, fallback_used, model_called, latency_ms, input_tokens, output_tokens,
  prompt_version, request_id) on table public.ai_calls to authenticated;
grant select, insert, update, delete on table public.ai_calls to service_role;

create policy ai_calls_select_admin
  on public.ai_calls
  for select
  to authenticated
  using ((select private.is_admin()));

create policy ai_calls_insert_own
  on public.ai_calls
  for insert
  to authenticated
  with check ((select private.is_active_user()) and user_id = (select auth.uid()));

-- Update і delete політик немає: рядки журналу не змінюються; старі видаляє лише тригер нижче.

-- ── 3. Зберігання 35 днів ──────────────────────────────────────────────────────
-- Після кожної вставки (раз на оператор) — видалити рядки, старіші за 35 днів. Без вставок прибирання не відбувається:
-- рядки (user_id і метадані, без тексту) лишаються до наступного запиту «Suggest lines». Свідомо без pg_cron: нове
-- розширення в обох проєктах і окремий розклад заради таблиці з десятками рядків на день; рядків мало, індекс по
-- created_at робить видалення дешевим. security definer у private: authenticated права delete не має.
create function private.prune_ai_calls()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.ai_calls where created_at < now() - interval '35 days';
  return null;
end;
$$;

revoke execute on function private.prune_ai_calls() from public, anon, authenticated;

create trigger ai_calls_prune_after_insert
  after insert on public.ai_calls
  for each statement execute function private.prune_ai_calls();
