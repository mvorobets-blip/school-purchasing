-- Перший зріз, задача 4.1 (план openspec/changes/impl-department-setup-2): деактивація працівника й захист останнього
-- активного адміністратора. AC: AC-ORG-10, 12, 18, 21, 30, 31, 32. Таблиці й RLS — міграція 20261021213618
-- (profiles.is_active, усі політики вимагають private.is_active_user()); роль approver / requester рахує private.sync_role.
--
-- Кожна функція в private: security definer, search_path = '', на початку перевіряє private.is_admin(). Обгортка в
-- public з тією самою сигнатурою — security invoker; її викликає supabase.rpc(…).
-- Помилки: FORBIDDEN (42501), LAST_ADMIN і NOT_FOUND (P0001, повідомлення = код) дія перекладає в тексти PM.

-- ── Хелпер: чи лишиться активний адміністратор, якщо p_profile_id перестане ним бути ──
-- Блокує рядки всіх активних адміністраторів (for update): дві одночасні дії чекають одна на одну, і друга бачить
-- уже змінений стан — школа не лишається без активного адміністратора навіть під гонкою.
create or replace function private.other_active_admin_exists(p_profile_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_others int;
begin
  perform 1 from public.profiles as p where p.role = 'admin' and p.is_active order by p.id for update;
  select count(*) into v_others
  from public.profiles as p
  where p.role = 'admin' and p.is_active and p.id <> p_profile_id;
  return v_others > 0;
end;
$$;

-- ── set_active: деактивувати / знову активувати працівника (AC-ORG-12, 18, 30) ──
-- Лише ставить is_active: членство, схвалення, автосхвалення, дозволи й роль не змінюються (AC-ORG-30).
create or replace function private.set_active(p_profile_id uuid, p_active boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
  v_active boolean;
begin
  if not private.is_admin() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  select p.role, p.is_active into v_role, v_active from public.profiles as p where p.id = p_profile_id;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  if not p_active and v_role = 'admin' and v_active and not private.other_active_admin_exists(p_profile_id) then
    raise exception 'LAST_ADMIN' using errcode = 'P0001';
  end if;
  update public.profiles set is_active = p_active where id = p_profile_id;
end;
$$;

-- ── remove_admin_role: зняти роль адміністратора — з себе чи з іншого (AC-ORG-10, 21, 31, 32) ──
-- Роль стає requester, а private.sync_role робить її approver, якщо працівник схвалює хоча б один відділ.
create or replace function private.remove_admin_role(p_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
  v_active boolean;
begin
  if not private.is_admin() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  select p.role, p.is_active into v_role, v_active from public.profiles as p where p.id = p_profile_id;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_role <> 'admin' then
    return;
  end if;
  if v_active and not private.other_active_admin_exists(p_profile_id) then
    raise exception 'LAST_ADMIN' using errcode = 'P0001';
  end if;
  update public.profiles set role = 'requester' where id = p_profile_id;
  perform private.sync_role(p_profile_id);
end;
$$;

-- ── Обгортки public (security invoker) для supabase.rpc(…) ─────────────────
create or replace function public.set_active(p_profile_id uuid, p_active boolean)
returns void
language sql
security invoker
set search_path = ''
as $$ select private.set_active(p_profile_id, p_active); $$;

create or replace function public.remove_admin_role(p_profile_id uuid)
returns void
language sql
security invoker
set search_path = ''
as $$ select private.remove_admin_role(p_profile_id); $$;

-- ── Права ───────────────────────────────────────────────────────────────────
-- Хелпер викликають лише функції вище (security definer) — клієнту він не потрібен.
revoke execute on function private.other_active_admin_exists(uuid) from public, anon, authenticated;
revoke execute on function private.set_active(uuid, boolean) from public, anon;
revoke execute on function private.remove_admin_role(uuid) from public, anon;
revoke execute on function public.set_active(uuid, boolean) from public, anon;
revoke execute on function public.remove_admin_role(uuid) from public, anon;

grant execute on function private.set_active(uuid, boolean) to authenticated;
grant execute on function private.remove_admin_role(uuid) to authenticated;
grant execute on function public.set_active(uuid, boolean) to authenticated;
grant execute on function public.remove_admin_role(uuid) to authenticated;
