-- Технічний борг WS9 (/code-review high, 13.11; docs/qa/proof-pack.md, «Технічний борг»): умова «кому видно заявку»
-- (автор, схвалювач її відділу, адміністратор — і лише активні; матриця прав «Бачити заявки», AC-FRM-08, AC-FRM-10,
-- AC-HIST-10) була записана тричі: у політиці purchase_requests_select_visible і в двох security definer функціях —
-- private.request_history (історія з іменами) та private.request_author_names (ім'я автора для схвалювача). Зміна
-- правила в одному місці мовчки розходилася б з іншими. Тепер умова — одна функція private.can_see_request, і всі три
-- місця її викликають. Поведінка не змінюється: ті самі умови, ті самі тексти функцій (застосовані міграції не
-- редагуємо — create or replace і alter policy).
--
-- Аргументи — автор і відділ заявки, а не її id: політика викликає функцію для кожного рядка purchase_requests, і пошук
-- заявки за id всередині політики тієї ж таблиці знову йшов би через RLS. Функція security definer у private
-- (search_path = ''), execute — лише authenticated (її викликають політика й функції від імені користувача).

-- ── 1. Одна умова видимості ────────────────────────────────────────────────────
create function private.can_see_request(p_author_id uuid, p_department_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select private.is_active_user())
    and (
      p_author_id = (select auth.uid())
      or (select private.is_admin())
      or private.is_approver_of(p_department_id)
    );
$$;

revoke execute on function private.can_see_request(uuid, uuid) from public, anon;
grant execute on function private.can_see_request(uuid, uuid) to authenticated;

comment on function private.can_see_request(uuid, uuid) is
  'Кому видно заявку: активний автор, схвалювач її відділу чи адміністратор. Єдине місце правила для RLS purchase_requests, private.request_history і private.request_author_names.';

-- ── 2. Політика заявок ─────────────────────────────────────────────────────────
-- alter policy змінює умову на місці, без вікна, коли політики немає.
alter policy purchase_requests_select_visible
  on public.purchase_requests
  using (private.can_see_request(author_id, department_id));

-- ── 3. Історія заявки (AC-HIST-06, AC-HIST-10) ─────────────────────────────────
-- Як у 20261106184819_request_history.sql; умова видимості — через private.can_see_request.
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
    and private.can_see_request(r.author_id, r.department_id)
  order by e.created_at, e.id;
$$;

-- ── 4. Ім'я автора для схвалювача (AC-APR-09, AC-APR-10) ───────────────────────
-- Як у 20261026222326_request_author_email_fallback.sql; умова видимості — через private.can_see_request.
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
    and private.can_see_request(r.author_id, r.department_id);
$$;
