-- Зріз 3 (WS9), задача 2 плану impl-purchase-history: історія заявки.
-- AC-HIST-06: у історії є запис «Подано» з іменем автора й датою та часом (America/New_York — форматує інтерфейс).
-- AC-HIST-10: історію бачить лише той, кому видно заявку (автор, схвалювач її відділу, адміністратор) — та сама умова,
-- що в політиці purchase_requests_select_visible; іншим — 0 записів, заявка не змінюється.
-- Історія не редагується (припущення PM у вимозі 64): authenticated має лише select, подію пише лише тригер подання.
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
  'Історія заявки: подання (і далі — рішення). Подання пише тригер purchase_requests_submitted_event; не редагується.';

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

-- ── 2. Подання пише подію — тригером на вставку заявки ─────────────────────────
-- Тригер, а не новий текст submit_purchase: CREATE TRIGGER бере блокування таблиці, що чекає завершення вставок, які
-- вже йдуть, тож після нього кожна нова заявка (зокрема подана ще старою функцією під час міграції) отримує подію в
-- тій самій транзакції. Подію пише функція private (security definer): authenticated не має insert на події.
create function private.add_submitted_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.purchase_request_events (request_id, kind, actor_id, created_at)
  values (new.id, 'submitted', new.author_id, new.created_at);
  return new;
end;
$$;

revoke execute on function private.add_submitted_event() from public, anon, authenticated;

create trigger purchase_requests_submitted_event
  after insert on public.purchase_requests
  for each row execute function private.add_submitted_event();

-- ── 3. Наявні заявки: подія «Подано» з датою подання й автором ──────────────────
-- Без lock table: Supabase CLI виконує міграцію не в одній транзакції (LOCK TABLE поза транзакцією — помилка 25P01).
-- Після тригера (розділ 2) усі заявки, вставлені раніше, уже закомічені; backfill дописує подію лише заявкам без неї —
-- без дублікатів, навіть якщо міграцію виконати повторно.
insert into public.purchase_request_events (request_id, kind, actor_id, created_at)
select r.id, 'submitted', r.author_id, r.created_at
from public.purchase_requests as r
where not exists (select 1 from public.purchase_request_events as e where e.request_id = r.id);

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
