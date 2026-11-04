-- Хелпери видимості заявок: одне оголошення поруч для заявок і рядків (RLS purchase_requests_select_visible,
-- purchase_request_lines_select_visible, private.decide_purchase). Сигнатури й результати без змін.

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

create or replace function private.is_approver_of(p_department_id uuid)
returns boolean
language sql
stable
security definer
as $$
  select exists (
    select 1 from public.department_members as m
    where m.department_id = p_department_id
      and m.profile_id = (select auth.uid())
      and m.is_approver
  );
$$;

revoke execute on function private.is_active_user() from public, anon;
revoke execute on function private.is_approver_of(uuid) from public, anon;
grant execute on function private.is_active_user() to authenticated;
grant execute on function private.is_approver_of(uuid) to authenticated;
