-- Зріз 2 (WS7), задача «Форма закупівлі й «Мої заявки»» плану impl-purchase-approval.
-- Закупівля з рядками; подання — лише функцією private.submit_purchase (перевірка прав першими рядками).
-- Правила шаблону: RLS на кожній таблиці; revoke all від anon і authenticated; явні grant лише на потрібні операції;
-- політика на кожну операцію (to authenticated, (select auth.uid())); security definer — лише в private з search_path = ''.
-- Прямих insert / update / delete для authenticated немає: статус, автора й відділ користувач не змінює (AC-FRM-02, 04).

-- ── 1. Таблиці ─────────────────────────────────────────────────────────────────
create table public.purchase_requests (
  id            uuid primary key default gen_random_uuid(),
  author_id     uuid not null references public.profiles (id) on delete restrict,
  department_id uuid not null references public.departments (id) on delete restrict,
  purchase_type text not null,
  status        text not null default 'pending',
  reject_reason text,
  decided_by    uuid references public.profiles (id) on delete restrict,
  decided_at    timestamptz,
  created_at    timestamptz not null default now(),
  constraint purchase_requests_purchase_type_check
    check (purchase_type in ('purchasing_department', 'self_purchase')),
  constraint purchase_requests_status_check
    check (status in ('pending', 'approved', 'rejected')),
  -- Відхилена заявка завжди має причину (AC-APR-06, AC-APR-07).
  constraint purchase_requests_reject_reason_check
    check (status <> 'rejected' or nullif(btrim(reject_reason), '') is not null)
);
create index purchase_requests_author_id_idx on public.purchase_requests (author_id);
create index purchase_requests_department_status_idx on public.purchase_requests (department_id, status);

comment on table public.purchase_requests is
  'Закупівля: автор, відділ, тип закупівлі, статус («Очікує схвалення» → «Схвалено» / «Відхилено»). Подання й рішення — лише функціями private.';

create table public.purchase_request_lines (
  id         uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.purchase_requests (id) on delete cascade,
  position   integer not null,
  name       text not null,
  purpose    text not null,
  quantity   numeric not null,
  price      numeric(12, 2) not null,
  constraint purchase_request_lines_name_check check (btrim(name) <> ''),
  constraint purchase_request_lines_purpose_check check (btrim(purpose) <> ''),
  -- Лише скінченні числа: NaN і Infinity зламали б будь-яку суму. Верхні межі значень — наступний зріз (PM, #60).
  constraint purchase_request_lines_quantity_check
    check (quantity > 0 and quantity <> 'NaN'::numeric and quantity <> 'Infinity'::numeric),
  constraint purchase_request_lines_price_check check (price >= 0 and price <> 'NaN'::numeric),
  unique (request_id, position)
);

comment on table public.purchase_request_lines is
  'Рядки закупівлі: назва, мета, кількість (> 0), ціна (≥ 0, два знаки після коми); лише скінченні числа. Верхні межі — наступний зріз.';

alter table public.purchase_requests enable row level security;
alter table public.purchase_request_lines enable row level security;

revoke all on table public.purchase_requests from anon, authenticated;
revoke all on table public.purchase_request_lines from anon, authenticated;
grant select on table public.purchase_requests to authenticated;
grant select on table public.purchase_request_lines to authenticated;
grant select, insert, update, delete on table public.purchase_requests to service_role;
grant select, insert, update, delete on table public.purchase_request_lines to service_role;

-- ── 2. Хелпер: схвалювач відділу ───────────────────────────────────────────────
create or replace function private.is_approver_of(p_department_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.department_members as m
    where m.department_id = p_department_id and m.profile_id = (select auth.uid()) and m.is_approver
  );
$$;

revoke execute on function private.is_approver_of(uuid) from public, anon;
grant execute on function private.is_approver_of(uuid) to authenticated;

-- ── 3. Політики RLS ────────────────────────────────────────────────────────────
-- Заявку бачать: автор, схвалювач її відділу, адміністратор — і лише активні (матриця прав «Бачити заявки»;
-- AC-FRM-08, AC-FRM-10: заявник того ж відділу чужої заявки не бачить).
create policy purchase_requests_select_visible
  on public.purchase_requests
  for select
  to authenticated
  using (
    (select private.is_active_user())
    and (
      author_id = (select auth.uid())
      or (select private.is_admin())
      or (select private.is_approver_of(department_id))
    )
  );

-- Рядки видно тому, хто бачить заявку (підзапит сам іде через політику purchase_requests).
create policy purchase_request_lines_select_visible
  on public.purchase_request_lines
  for select
  to authenticated
  -- Явна перевірка активного користувача (правило AGENTS.md) і видимість заявки: підзапит іде з RLS заявки
  -- (автор, схвалювач відділу, адміністратор), тож чужих рядків не видно.
  using (
    (select private.is_active_user())
    and exists (select 1 from public.purchase_requests as r where r.id = request_id)
  );

-- ── 4. Подання закупівлі ───────────────────────────────────────────────────────
-- p_lines — масив об'єктів {name, purpose, quantity, price}. Помилки:
--   42501 FORBIDDEN     — неактивний, не заявник відділу (не адміністратор), «Самостійна закупівля» без дозволу (AC-FRM-02, 04);
--   P0001 NO_LINES      — жодного рядка (AC-FRM-06);
--   P0001 INVALID_LINE  — порожнє поле рядка: усі чотири обов'язкові (AC-FRM-15, рішення PM #60);
--   22023 INVALID_TYPE  — невідомий тип закупівлі.
-- Відділ без схвалювача чи єдиний схвалювач-автор поданню не заважають (AC-FRM-12, AC-FRM-13).
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
  v_quantity numeric;
  v_price numeric;
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
    -- Кількість і ціна — справжні скінченні числа: кількість > 0, ціна ≥ 0 і вміщується в numeric(12, 2).
    begin
      v_quantity := (v_line ->> 'quantity')::numeric;
      v_price := (v_line ->> 'price')::numeric;
    exception when invalid_text_representation or numeric_value_out_of_range then
      raise exception 'INVALID_LINE';
    end;
    if v_quantity = 'NaN'::numeric or v_quantity = 'Infinity'::numeric or v_quantity <= 0
      or v_price = 'NaN'::numeric or v_price = 'Infinity'::numeric or v_price < 0 or v_price >= 10000000000 then
      raise exception 'INVALID_LINE';
    end if;
  end loop;

  insert into public.purchase_requests (author_id, department_id, purchase_type)
  values (v_uid, p_department_id, p_purchase_type)
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

-- Обгортка для supabase.rpc: та сама сигнатура, security invoker — права перевіряє private.submit_purchase.
create or replace function public.submit_purchase(p_department_id uuid, p_purchase_type text, p_lines jsonb)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.submit_purchase(p_department_id, p_purchase_type, p_lines);
$$;

revoke execute on function private.submit_purchase(uuid, text, jsonb) from public, anon;
revoke execute on function public.submit_purchase(uuid, text, jsonb) from public, anon;
grant execute on function private.submit_purchase(uuid, text, jsonb) to authenticated;
grant execute on function public.submit_purchase(uuid, text, jsonb) to authenticated;
