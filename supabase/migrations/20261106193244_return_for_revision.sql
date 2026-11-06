-- Зріз 3 (WS9), задача 4 плану impl-purchase-history: повернення на доопрацювання (AC-DEC-04, AC-DEC-06).
-- Рішення «return» — лише з непорожньою причиною (інакше NO_REASON, заявка не змінюється); причину збережено й показано
-- автору (вимога 63, основний сценарій, крок 3). Ті самі перевірки першими рядками, що й для інших рішень.
-- Решта private.decide_purchase — як у 20261106190909_partial_approval.sql (застосовану міграцію не редагуємо);
-- обгортка public.decide_purchase і права execute — без змін (та сама сигнатура).

-- ── 1. Причина повернення ──────────────────────────────────────────────────────
alter table public.purchase_requests add column return_reason text;
alter table public.purchase_requests
  add constraint purchase_requests_return_reason_length
    check (return_reason is null or char_length(return_reason) <= 500),
  -- Повернена заявка завжди з причиною (AC-DEC-06).
  add constraint purchase_requests_return_reason_check
    check (status <> 'returned' or nullif(btrim(return_reason), '') is not null);

comment on column public.purchase_requests.return_reason is
  'Причина повернення на доопрацювання (≤ 500): пише лише private.decide_purchase; видно тим, хто бачить заявку.';

-- ── 2. Рішення «return» ────────────────────────────────────────────────────────
create or replace function private.decide_purchase(
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
  if p_decision is null or p_decision not in ('approve', 'reject', 'return')
    or (p_decision in ('reject', 'return') and cardinality(v_rejected) > 0) then
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

  if p_decision = 'return' then
    if v_reason is null then
      raise exception 'NO_REASON';
    end if;
    update public.purchase_requests
      set status = 'returned', return_reason = v_reason, decided_by = v_uid, decided_at = now()
      where id = p_request_id;
    return;
  end if;

  if array_position(v_rejected, null) is not null then
    raise exception 'INVALID_LINE';
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
