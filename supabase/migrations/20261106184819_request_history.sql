-- Зріз 3 (WS9), задача 2 плану impl-purchase-history: історія заявки.
-- AC-HIST-06: у історії є запис «Подано» з іменем автора й датою та часом (America/New_York — форматує інтерфейс).
-- AC-HIST-10: історію бачить лише той, кому видно заявку (автор, схвалювач її відділу, адміністратор) — та сама умова,
-- що в політиці purchase_requests_select_visible; іншим — 0 записів, заявка не змінюється.
-- Історія не редагується (припущення PM у вимозі 64): authenticated має лише select, insert робить лише функція подання.
-- Записи рішень (схвалення, відхилення, повернення) — поза WS9 (вимога 64, «Поза межами»).

-- ── 1. Таблиця подій ───────────────────────────────────────────────────────────
create table public.purchase_request_events (
  id         uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.purchase_requests (id) on delete cascade,
  kind       text not null,
  actor_id   uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint purchase_request_events_kind_check check (kind in ('submitted'))
);
create index purchase_request_events_request_id_idx on public.purchase_request_events (request_id, created_at);

comment on table public.purchase_request_events is
  'Історія заявки: подання (і далі — рішення). Пише лише private.submit_purchase; не редагується.';

alter table public.purchase_request_events enable row level security;
revoke all on table public.purchase_request_events from anon, authenticated;
grant select on table public.purchase_request_events to authenticated;
grant select, insert, update, delete on table public.purchase_request_events to service_role;

-- Подію видно тому, хто бачить заявку: підзапит іде через RLS purchase_requests (автор, схвалювач відділу, адміністратор).
create policy purchase_request_events_select_visible
  on public.purchase_request_events
  for select
  to authenticated
  using (
    (select private.is_active_user())
    and exists (select 1 from public.purchase_requests as r where r.id = request_id)
  );

-- ── 2. Наявні заявки: подія «Подано» з датою подання й автором ──────────────────
insert into public.purchase_request_events (request_id, kind, actor_id, created_at)
select r.id, 'submitted', r.author_id, r.created_at
from public.purchase_requests as r;

-- ── 3. Подання пише подію в тій самій транзакції ───────────────────────────────
-- Решта функції — як у 20261106162407_request_number_and_line_limits.sql (застосовану міграцію не редагуємо).
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
  v_created timestamptz;
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
  returning id, created_at into v_id, v_created;

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

  insert into public.purchase_request_events (request_id, kind, actor_id, created_at)
  values (v_id, 'submitted', v_uid, v_created);

  return v_id;
end;
$$;

-- ── 4. Історія з іменем учасника ───────────────────────────────────────────────
-- Ім'я з профілю, без імені — email (як AC-APR-09); лише якщо заявку видно (та сама умова, що в RLS заявки):
-- профілі колег закриті RLS, тож ім'я віддає security definer, але не ширше, ніж видно саму заявку.
create or replace function private.request_history(p_request_id uuid)
returns table (kind text, actor_name text, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select e.kind, coalesce(nullif(btrim(p.full_name), ''), p.email), e.created_at
  from public.purchase_request_events as e
  join public.purchase_requests as r on r.id = e.request_id
  join public.profiles as p on p.id = e.actor_id
  where e.request_id = p_request_id
    and (select private.is_active_user())
    and (
      r.author_id = (select auth.uid())
      or (select private.is_admin())
      or private.is_approver_of(r.department_id)
    )
  order by e.created_at, e.id;
$$;

-- Обгортка для supabase.rpc: security invoker — права перевіряє private.request_history.
create or replace function public.request_history(p_request_id uuid)
returns table (kind text, actor_name text, created_at timestamptz)
language sql
stable
security invoker
set search_path = ''
as $$
  select * from private.request_history(p_request_id);
$$;

revoke execute on function private.request_history(uuid) from public, anon;
revoke execute on function public.request_history(uuid) from public, anon;
grant execute on function private.request_history(uuid) to authenticated;
grant execute on function public.request_history(uuid) to authenticated;
