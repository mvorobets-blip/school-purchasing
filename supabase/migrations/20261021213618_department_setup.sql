-- Зріз WS6, задача 1.1: ролі requester / approver / admin, активність працівника, відділи, членство, дозволи.
-- План: openspec/changes/impl-department-setup/design.md (розділи 1–2); рішення — docs/decisions/0001-org-data-model.md.
-- AC: AC-ORG-04, AC-ORG-05, AC-ORG-19, AC-ORG-24 (тригер ролі); таблиці й RLS — основа для решти AC зрізу.

-- ── 1. Ролі: старе правило → дані → default → нове правило ────────────────────
-- Старий profiles_role_check пропускає лише member/admin, тож знімаємо його першим (інакше UPDATE дасть 23514).
alter table public.profiles drop constraint profiles_role_check;
update public.profiles set role = 'requester' where role = 'member';
-- Новий default — до нового правила: тригер on_auth_user_created вставляє профіль із default-роллю.
alter table public.profiles alter column role set default 'requester';
alter table public.profiles
  add constraint profiles_role_check check (role in ('requester', 'approver', 'admin'));

-- ── 2. Активність працівника (деактивація лише ставить false, нічого не видаляє; AC-ORG-12, AC-ORG-30) ──
alter table public.profiles add column is_active boolean not null default true;

-- ── 3. Таблиці ──────────────────────────────────────────────────────────────
create table public.departments (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  created_at timestamptz not null default now(),
  constraint departments_name_length check (char_length(btrim(name)) between 1 and 100)
);
-- Назва унікальна без урахування регістру (AC-ORG-34): помилку 23505 дія перекладає в повідомлення PM.
create unique index departments_name_lower_key on public.departments (lower(btrim(name)));

comment on table public.departments is
  'Відділ школи. Створює лише адміністратор; перейменування й видалення — наступний зріз.';

-- Рядок = членство заявника; схвалення й автосхвалення — прапорці того самого рядка (AC-ORG-02, 03, 15, 33).
create table public.department_members (
  department_id uuid not null references public.departments (id) on delete restrict,
  profile_id    uuid not null references public.profiles (id) on delete cascade,
  is_approver   boolean not null default false,
  auto_approve  boolean not null default false,
  created_at    timestamptz not null default now(),
  primary key (department_id, profile_id)
);
create index department_members_profile_id_idx on public.department_members (profile_id);

comment on table public.department_members is
  'Членство заявника у відділі; прапорці is_approver і auto_approve. Змінюють лише функції private (задача 3.1).';

create table public.employee_permissions (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  permission text not null,
  granted_at timestamptz not null default now(),
  primary key (profile_id, permission),
  constraint employee_permissions_permission_check
    check (permission in ('card_expense', 'check_request', 'vendor_bill', 'self_purchase'))
);

comment on table public.employee_permissions is
  'Дозволи працівника на типи заявок і тип закупівлі «Самостійна закупівля». Видає й забирає адміністратор.';

alter table public.departments enable row level security;
alter table public.department_members enable row level security;
alter table public.employee_permissions enable row level security;

-- ── 4. Права (GRANT) ────────────────────────────────────────────────────────
revoke all on table public.departments from anon, authenticated;
revoke all on table public.department_members from anon, authenticated;
revoke all on table public.employee_permissions from anon, authenticated;

grant select, insert on table public.departments to authenticated;
-- department_members: клієнт лише читає; зміни — функції private (задача 3.1), без прямих insert/update/delete.
grant select on table public.department_members to authenticated;
grant select, insert, delete on table public.employee_permissions to authenticated;

-- Серверні скрипти (npm run users:demo) працюють як service_role.
grant select, insert, update, delete on table public.departments to service_role;
grant select, insert, update, delete on table public.department_members to service_role;
grant select, insert, update, delete on table public.employee_permissions to service_role;

-- ── 5. Хелпери для RLS (security definer, search_path = '') ──────────────────
-- Читають profiles / department_members в обхід RLS, тож політики не зациклюються (42P17).
create or replace function private.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select p.is_active from public.profiles as p where p.id = (select auth.uid())),
    false
  );
$$;

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles as p
    where p.id = (select auth.uid()) and p.role = 'admin' and p.is_active
  );
$$;

create or replace function private.is_member_of(p_department_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.department_members as m
    where m.department_id = p_department_id and m.profile_id = (select auth.uid())
  );
$$;

-- Схема private уже має usage для authenticated (стартова міграція); повторюємо явно для читача.
grant usage on schema private to authenticated;
revoke execute on function private.is_active_user() from public, anon;
revoke execute on function private.is_admin() from public, anon;
revoke execute on function private.is_member_of(uuid) from public, anon;
grant execute on function private.is_active_user() to authenticated;
grant execute on function private.is_admin() to authenticated;
grant execute on function private.is_member_of(uuid) to authenticated;

-- ── 6. Політики RLS (окремо на кожну операцію; деактивований нічого не бачить — AC-ORG-12) ──
-- profiles: замінюємо політики шаблону, додаючи вимогу активності.
drop policy profiles_select_own_or_admin on public.profiles;
drop policy profiles_update_own on public.profiles;

create policy profiles_select_own_or_admin
  on public.profiles
  for select
  to authenticated
  using (
    (select private.is_active_user())
    and (id = (select auth.uid()) or (select private.is_admin()))
  );

create policy profiles_update_own
  on public.profiles
  for update
  to authenticated
  using ((select private.is_active_user()) and id = (select auth.uid()))
  with check ((select private.is_active_user()) and id = (select auth.uid()));

-- departments: власні відділи через членство або адміністратор (AC-ORG-09; design.md, розділ 2).
create policy departments_select_member_or_admin
  on public.departments
  for select
  to authenticated
  using (
    (select private.is_active_user())
    and ((select private.is_admin()) or (select private.is_member_of(id)))
  );

create policy departments_insert_admin
  on public.departments
  for insert
  to authenticated
  with check ((select private.is_admin()));

-- department_members: власні рядки або адміністратор.
create policy department_members_select_own_or_admin
  on public.department_members
  for select
  to authenticated
  using (
    (select private.is_active_user())
    and (profile_id = (select auth.uid()) or (select private.is_admin()))
  );

-- employee_permissions: власні або адміністратор; видає й забирає адміністратор.
create policy employee_permissions_select_own_or_admin
  on public.employee_permissions
  for select
  to authenticated
  using (
    (select private.is_active_user())
    and (profile_id = (select auth.uid()) or (select private.is_admin()))
  );

create policy employee_permissions_insert_admin
  on public.employee_permissions
  for insert
  to authenticated
  with check ((select private.is_admin()));

create policy employee_permissions_delete_admin
  on public.employee_permissions
  for delete
  to authenticated
  using ((select private.is_admin()));

-- ── 7. «Правило ролей»: роль approver / requester рахує база ─────────────────
-- Працівник без ролі admin — approver, якщо схвалює хоча б один відділ, інакше requester (AC-ORG-04, 05, 19, 24).
-- Роль admin тригер не чіпає (AC-ORG-11, AC-ORG-20).
create or replace function private.sync_role(p_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles as p
  set role = case
    when exists (
      select 1 from public.department_members as m
      where m.profile_id = p_profile_id and m.is_approver
    ) then 'approver'
    else 'requester'
  end
  where p.id = p_profile_id and p.role <> 'admin';
end;
$$;

create or replace function private.on_department_members_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    perform private.sync_role(old.profile_id);
  else
    perform private.sync_role(new.profile_id);
    if tg_op = 'UPDATE' and new.profile_id <> old.profile_id then
      perform private.sync_role(old.profile_id);
    end if;
  end if;
  return null;
end;
$$;

-- Тригерні функції викликає лише сама база.
revoke execute on function private.sync_role(uuid) from public, anon, authenticated;
revoke execute on function private.on_department_members_change() from public, anon, authenticated;

create trigger department_members_sync_role
  after insert or update or delete on public.department_members
  for each row execute function private.on_department_members_change();

-- ── 8. Довідкові дані: відділи (сид у хмарі вже виконано, тому — міграцією, ідемпотентно) ──
insert into public.departments (name)
values ('Початкова школа'), ('Вища школа'), ('Офіс')
on conflict do nothing;
