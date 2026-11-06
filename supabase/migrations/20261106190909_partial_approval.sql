-- Зріз 3 (WS9), задача 3 плану impl-purchase-history: часткове схвалення (AC-DEC-01).
-- Нові статуси заявки «Частково схвалено» і «Повернено на доопрацювання» (останній використає задача 4); статус рядка.
-- Рішення — лише функцією private.decide_purchase (перевірки першими рядками, як у 20261025192130_purchase_decisions.sql);
-- прямого update немає (grant update на заявки й рядки не видано).
-- Помилки decide_purchase:
--   42501 FORBIDDEN          — неактивний, не схвалювач відділу заявки (AC-APR-03, 04);
--   42501 OWN_REQUEST        — автор вирішує власну заявку (AC-APR-05);
--   22023 INVALID_DECISION   — невідоме рішення або позначені рядки при відхиленні цілком;
--   P0001 NOT_PENDING        — заявка вже вирішена;
--   P0001 NO_REASON          — відхилення без причини (AC-APR-06);
--   P0001 INVALID_LINE       — позначено рядок, якого в заявці немає;
--   P0001 ALL_LINES_REJECTED — позначено всі рядки: «All lines are rejected: reject the whole request» (таблиця #49).
-- «Схвалено» — лише без відхилених рядків (MODIFIED «Рішення схвалювача»); причини для окремого рядка немає (#63).

-- ── 1. Статуси ─────────────────────────────────────────────────────────────────
alter table public.purchase_requests drop constraint purchase_requests_status_check;
alter table public.purchase_requests add constraint purchase_requests_status_check
  check (status in ('pending', 'approved', 'rejected', 'partially_approved', 'returned'));

alter table public.purchase_request_lines add column status text;
alter table public.purchase_request_lines add constraint purchase_request_lines_status_check
  check (status is null or status in ('approved', 'rejected'));

comment on column public.purchase_request_lines.status is
  'Рішення по рядку: null — ще не вирішено; approved / rejected — пише лише private.decide_purchase.';

-- ── 2. Рішення з позначеними рядками ───────────────────────────────────────────
drop function public.decide_purchase(uuid, text, text);
drop function private.decide_purchase(uuid, text, text);

create function private.decide_purchase(
  p_request_id uuid,
  p_decision text,
  p_reason text default null,
  p_rejected_positions integer[] default '{}'
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_request public.purchase_requests%rowtype;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_rejected integer[] := coalesce(p_rejected_positions, '{}');
  v_lines integer;
  v_marked integer;
begin
  if not private.is_active_user() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  select * into v_request from public.purchase_requests where id = p_request_id for update;
  -- Неіснуюча заявка й заявка чужого відділу дають ту саму відмову — без розкриття, чи заявка існує.
  if not found or not private.is_approver_of(v_request.department_id) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if v_request.author_id = v_uid then
    raise exception 'OWN_REQUEST' using errcode = '42501';
  end if;
  if p_decision is null or p_decision not in ('approve', 'reject')
    or (p_decision = 'reject' and cardinality(v_rejected) > 0) then
    raise exception 'INVALID_DECISION' using errcode = '22023';
  end if;
  if v_request.status <> 'pending' then
    raise exception 'NOT_PENDING';
  end if;

  if p_decision = 'reject' then
    if v_reason is null then
      raise exception 'NO_REASON';
    end if;
    update public.purchase_requests
      set status = 'rejected', reject_reason = v_reason, decided_by = v_uid, decided_at = now()
      where id = p_request_id;
    return;
  end if;

  select count(*) into v_lines from public.purchase_request_lines where request_id = p_request_id;
  select count(*) into v_marked
    from public.purchase_request_lines
    where request_id = p_request_id and position = any (v_rejected);
  if v_marked <> (select count(distinct x) from unnest(v_rejected) as x) then
    raise exception 'INVALID_LINE';
  end if;
  if v_marked > 0 and v_marked = v_lines then
    raise exception 'ALL_LINES_REJECTED';
  end if;

  update public.purchase_request_lines
    set status = case when position = any (v_rejected) then 'rejected' else 'approved' end
    where request_id = p_request_id;
  update public.purchase_requests
    set status = case when v_marked > 0 then 'partially_approved' else 'approved' end,
        decided_by = v_uid,
        decided_at = now()
    where id = p_request_id;
end;
$$;

-- Обгортка для supabase.rpc: security invoker — права перевіряє private.decide_purchase.
create function public.decide_purchase(
  p_request_id uuid,
  p_decision text,
  p_reason text default null,
  p_rejected_positions integer[] default '{}'
)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.decide_purchase(p_request_id, p_decision, p_reason, p_rejected_positions);
$$;

revoke execute on function private.decide_purchase(uuid, text, text, integer[]) from public, anon;
revoke execute on function public.decide_purchase(uuid, text, text, integer[]) from public, anon;
grant execute on function private.decide_purchase(uuid, text, text, integer[]) to authenticated;
grant execute on function public.decide_purchase(uuid, text, text, integer[]) to authenticated;

-- ── 3. Чи може поточний користувач вирішити заявку ─────────────────────────────
-- Сторінка заявки показує «Reject line» і кнопки рішення лише тоді, коли рішення можливе. Відповідь — лише так / ні:
-- членства й профілі сторінка не читає (AC-APR-10). Права самого рішення все одно перевіряє private.decide_purchase.
create function private.can_decide_purchase(p_request_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.purchase_requests as r
    where r.id = p_request_id
      and r.status = 'pending'
      and r.author_id <> (select auth.uid())
      and (select private.is_active_user())
      and private.is_approver_of(r.department_id)
  );
$$;

create function public.can_decide_purchase(p_request_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select private.can_decide_purchase(p_request_id);
$$;

revoke execute on function private.can_decide_purchase(uuid) from public, anon;
revoke execute on function public.can_decide_purchase(uuid) from public, anon;
grant execute on function private.can_decide_purchase(uuid) to authenticated;
grant execute on function public.can_decide_purchase(uuid) to authenticated;
