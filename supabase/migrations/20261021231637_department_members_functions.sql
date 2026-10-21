-- Зріз WS6, задача 3.1: зміни заявників, схвалювачів і автосхвалення — лише через функції (RPC).
-- План: openspec/changes/impl-department-setup/design.md, розділ 2 «Функції змін (RPC)»; ADR 0001.
-- AC: AC-ORG-01, 02, 03, 04, 05, 06, 15, 19, 20, 24, 33. Роль після змін рахує тригер private.sync_role (міграція 20261021213618).
--
-- Кожна функція в private: security definer, search_path = '', на початку перевіряє private.is_admin().
-- Обгортка в public з тією самою сигнатурою — security invoker; її викликає supabase.rpc(…).
-- Помилки: FORBIDDEN (42501) і NOT_REQUESTER (P0001, повідомлення = код) дія перекладає в тексти PM.

-- ── add_requester: додати працівника до відділу як заявника (AC-ORG-01) ──────
create or replace function private.add_requester(p_department_id uuid, p_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  insert into public.department_members (department_id, profile_id)
  values (p_department_id, p_profile_id)
  on conflict (department_id, profile_id) do nothing;
end;
$$;

-- ── remove_requester: прибрати із заявників — зникає й схвалення, й автосхвалення (AC-ORG-03, 15, 24) ──
create or replace function private.remove_requester(p_department_id uuid, p_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  delete from public.department_members
  where department_id = p_department_id and profile_id = p_profile_id;
end;
$$;

-- ── set_approver: призначити / зняти схвалювача; лише заявнику відділу (AC-ORG-02, 04, 05, 19, 20) ──
create or replace function private.set_approver(p_department_id uuid, p_profile_id uuid, p_value boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  update public.department_members
  set is_approver = p_value
  where department_id = p_department_id and profile_id = p_profile_id;
  if not found and p_value then
    raise exception 'NOT_REQUESTER' using errcode = 'P0001';
  end if;
end;
$$;

-- ── set_auto_approve: увімкнути / вимкнути автосхвалення; лише заявнику відділу (AC-ORG-06, 33) ──
create or replace function private.set_auto_approve(p_department_id uuid, p_profile_id uuid, p_value boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  update public.department_members
  set auto_approve = p_value
  where department_id = p_department_id and profile_id = p_profile_id;
  if not found and p_value then
    raise exception 'NOT_REQUESTER' using errcode = 'P0001';
  end if;
end;
$$;

-- ── Обгортки public (security invoker) для supabase.rpc(…) ─────────────────
create or replace function public.add_requester(p_department_id uuid, p_profile_id uuid)
returns void
language sql
security invoker
set search_path = ''
as $$ select private.add_requester(p_department_id, p_profile_id); $$;

create or replace function public.remove_requester(p_department_id uuid, p_profile_id uuid)
returns void
language sql
security invoker
set search_path = ''
as $$ select private.remove_requester(p_department_id, p_profile_id); $$;

create or replace function public.set_approver(p_department_id uuid, p_profile_id uuid, p_value boolean)
returns void
language sql
security invoker
set search_path = ''
as $$ select private.set_approver(p_department_id, p_profile_id, p_value); $$;

create or replace function public.set_auto_approve(p_department_id uuid, p_profile_id uuid, p_value boolean)
returns void
language sql
security invoker
set search_path = ''
as $$ select private.set_auto_approve(p_department_id, p_profile_id, p_value); $$;

-- ── Права: для кожної функції з повною сигнатурою, і в private, і в public ──
-- Обгортки security invoker, тож authenticated потрібне execute і на private-функції; право дії перевіряє private.is_admin().
revoke execute on function private.add_requester(uuid, uuid) from public, anon;
revoke execute on function private.remove_requester(uuid, uuid) from public, anon;
revoke execute on function private.set_approver(uuid, uuid, boolean) from public, anon;
revoke execute on function private.set_auto_approve(uuid, uuid, boolean) from public, anon;
revoke execute on function public.add_requester(uuid, uuid) from public, anon;
revoke execute on function public.remove_requester(uuid, uuid) from public, anon;
revoke execute on function public.set_approver(uuid, uuid, boolean) from public, anon;
revoke execute on function public.set_auto_approve(uuid, uuid, boolean) from public, anon;

grant execute on function private.add_requester(uuid, uuid) to authenticated;
grant execute on function private.remove_requester(uuid, uuid) to authenticated;
grant execute on function private.set_approver(uuid, uuid, boolean) to authenticated;
grant execute on function private.set_auto_approve(uuid, uuid, boolean) to authenticated;
grant execute on function public.add_requester(uuid, uuid) to authenticated;
grant execute on function public.remove_requester(uuid, uuid) to authenticated;
grant execute on function public.set_approver(uuid, uuid, boolean) to authenticated;
grant execute on function public.set_auto_approve(uuid, uuid, boolean) to authenticated;
