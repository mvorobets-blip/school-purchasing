-- Зріз 3 (WS9), задача 1 плану impl-purchase-history: номер заявки й межі рядків.
-- AC-HIST-01: номер «PUR-» і число, на одиницю більше за останній виданий; перша — PUR-1; не повторюється навіть після
-- видалення (послідовність не відкочується). Наявним заявкам номери видано за датою подання, найстаріша — 1
-- (відповідь PM ValiaBihun/2026-quitcode-dream-team#73).
-- Межі рядків — припущення PM у вимозі 64: кількість — ціле число від 1, ціна — число від 0 (повідомлення з таблиці 49).
-- Обмеження таблиці на цілу кількість НЕ додаємо: на проді можуть бути дробові рядки зрізу 2 — межу тримає функція.
-- Помилки private.validate_purchase_lines (і, отже, submit_purchase):
--   P0001 NO_LINES         — жодного рядка (AC-FRM-06);
--   P0001 INVALID_LINE     — порожнє поле рядка (AC-FRM-15);
--   P0001 INVALID_QUANTITY — кількість не ціле число від 1;
--   P0001 INVALID_PRICE    — ціна не число, від'ємна чи ≥ 10 000 000 000 після округлення до центів.
-- Решта private.submit_purchase — як у 20261027132703_submit_purchase_rounded_price_limit.sql (застосовану міграцію не
-- редагуємо); обгортка public.submit_purchase і права execute — без змін.

-- ── 1. Номер заявки ────────────────────────────────────────────────────────────
create sequence private.purchase_request_number_seq as integer start with 1;

alter table public.purchase_requests add column number integer;

-- Backfill оновлює кожен рядок, а Postgres перевіряє на update і обмеження «not valid». Причина відхилення ≤ 500
-- (20261027142924_purchase_text_limits.sql) додана як «not valid»: на проді можуть бути довші старі причини, і backfill
-- упав би. Тому знімаємо її на час backfill і повертаємо так само «not valid» (нові записи вона й далі перевіряє).
alter table public.purchase_requests drop constraint purchase_requests_reject_reason_length;

update public.purchase_requests as r
  set number = n.rn
  from (select id, row_number() over (order by created_at, id) as rn from public.purchase_requests) as n
  where r.id = n.id;

alter table public.purchase_requests
  add constraint purchase_requests_reject_reason_length
    check (reject_reason is null or char_length(reject_reason) <= 500) not valid;

select setval(
  'private.purchase_request_number_seq',
  coalesce((select max(number) from public.purchase_requests), 0) + 1,
  false
);

alter table public.purchase_requests alter column number set not null;
alter table public.purchase_requests add constraint purchase_requests_number_key unique (number);
-- «owned by» колонці не ставимо: Postgres дозволяє його лише в тій самій схемі, а послідовність навмисно в private
-- (PostgREST її не відкриває, nextval — лише через private.submit_purchase).

comment on column public.purchase_requests.number is
  'Номер заявки (показується як PUR-<number>): видає private.submit_purchase з private.purchase_request_number_seq.';

-- ── 2. Перевірка рядків ────────────────────────────────────────────────────────
create or replace function private.validate_purchase_lines(p_lines jsonb)
returns void
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_line jsonb;
  v_quantity numeric;
  v_price numeric;
begin
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'NO_LINES';
  end if;
  for v_line in select value from jsonb_array_elements(p_lines) loop
    if coalesce(btrim(v_line ->> 'name'), '') = ''
      or coalesce(btrim(v_line ->> 'purpose'), '') = ''
      or coalesce(btrim(v_line ->> 'quantity'), '') = ''
      or coalesce(btrim(v_line ->> 'price'), '') = '' then
      raise exception 'INVALID_LINE';
    end if;
    begin
      v_quantity := (v_line ->> 'quantity')::numeric;
    exception when invalid_text_representation or numeric_value_out_of_range then
      raise exception 'INVALID_QUANTITY';
    end;
    if v_quantity = 'NaN'::numeric or v_quantity = 'Infinity'::numeric or v_quantity = '-Infinity'::numeric
      or v_quantity < 1 or v_quantity <> trunc(v_quantity) or v_quantity > 2147483647 then
      raise exception 'INVALID_QUANTITY';
    end if;
    begin
      v_price := (v_line ->> 'price')::numeric;
    exception when invalid_text_representation or numeric_value_out_of_range then
      raise exception 'INVALID_PRICE';
    end;
    if v_price = 'NaN'::numeric or v_price = 'Infinity'::numeric or v_price = '-Infinity'::numeric
      or v_price < 0 or round(v_price, 2) >= 10000000000 then
      raise exception 'INVALID_PRICE';
    end if;
  end loop;
end;
$$;

-- Security invoker без доступу до таблиць: викликає лише private.submit_purchase (security definer, від власника),
-- тож окремий grant нікому не потрібен.
revoke execute on function private.validate_purchase_lines(jsonb) from public, anon, authenticated;

-- ── 3. Подання закупівлі з номером ─────────────────────────────────────────────
create or replace function private.submit_purchase(p_department_id uuid, p_purchase_type text, p_lines jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_admin boolean := private.is_admin();
  v_id uuid;
  v_line jsonb;
  v_position integer := 0;
begin
  if not private.is_active_user() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if not (v_admin or private.is_member_of(p_department_id)) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_purchase_type is null or p_purchase_type not in ('purchasing_department', 'self_purchase') then
    raise exception 'INVALID_TYPE' using errcode = '22023';
  end if;
  if p_purchase_type = 'self_purchase' and not v_admin and not exists (
    select 1 from public.employee_permissions as e
    where e.profile_id = v_uid and e.permission = 'self_purchase'
  ) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  perform private.validate_purchase_lines(p_lines);

  insert into public.purchase_requests (author_id, department_id, purchase_type, number)
  values (v_uid, p_department_id, p_purchase_type, nextval('private.purchase_request_number_seq'))
  returning id into v_id;

  for v_line in select value from jsonb_array_elements(p_lines) loop
    v_position := v_position + 1;
    insert into public.purchase_request_lines (request_id, position, name, purpose, quantity, price)
    values (
      v_id,
      v_position,
      btrim(v_line ->> 'name'),
      btrim(v_line ->> 'purpose'),
      (v_line ->> 'quantity')::numeric,
      round((v_line ->> 'price')::numeric, 2)
    );
  end loop;

  return v_id;
end;
$$;
