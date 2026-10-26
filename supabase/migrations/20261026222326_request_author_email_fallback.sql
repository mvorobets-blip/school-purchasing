-- Ім'я автора для схвалювача: без імені в профілі — його email (AC-APR-09, відповідь PM на
-- ValiaBihun/2026-quitcode-dream-team#62). Та сама функція, що в 20261026160000_request_author_names.sql (застосовану
-- міграцію не редагуємо): ті самі умови видимості (автор, схвалювач відділу заявки, адміністратор), і далі лише одне
-- поле — ім'я або email; ролі, відділів і дозволів автора функція не віддає (AC-APR-10). Обгортка public і права
-- execute — без змін.

create or replace function private.request_author_names(p_request_ids uuid[])
returns table (request_id uuid, author_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, coalesce(nullif(btrim(p.full_name), ''), p.email)
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
