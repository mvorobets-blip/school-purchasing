-- Хто подав заявку: ім'я автора для тих, хто бачить заявку (автор, схвалювач відділу заявки, адміністратор).
-- Профілі колег закриті RLS (бачимо лише власний; адміністратор — усі), тож не відкриваємо їх ширше: функція віддає
-- лише ім'я (без email і решти профілю) і лише для заявок, які людині дозволено бачити (ті самі умови, що й політика
-- purchase_requests_select_visible). Читання колонки — у private (security definer, search_path = ''),
-- обгортка public — security invoker, execute лише authenticated.

create or replace function private.request_author_names(p_request_ids uuid[])
returns table (request_id uuid, author_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, p.full_name
  from public.purchase_requests as r
  join public.profiles as p on p.id = r.author_id
  where r.id = any (p_request_ids)
    and (select private.is_active_user())
    and (
      r.author_id = (select auth.uid())
      or (select private.is_admin())
      or private.is_approver_of(r.department_id)
    );
$$;

-- Обгортка для supabase.rpc: security invoker — права перевіряє private.request_author_names.
create or replace function public.request_author_names(p_request_ids uuid[])
returns table (request_id uuid, author_name text)
language sql
stable
security invoker
set search_path = ''
as $$
  select * from private.request_author_names(p_request_ids);
$$;

revoke execute on function private.request_author_names(uuid[]) from public, anon;
revoke execute on function public.request_author_names(uuid[]) from public, anon;
grant execute on function private.request_author_names(uuid[]) to authenticated;
grant execute on function public.request_author_names(uuid[]) to authenticated;
