-- Зріз 2 (WS7), задача «Рішення схвалювача» плану impl-purchase-approval.
-- Рішення — лише функцією private.decide_purchase (перевірки першими рядками); прямого update статусу немає
-- (grant update на purchase_requests не видано — міграція 20261025184732_purchase_requests.sql).
-- Помилки:
--   42501 FORBIDDEN     — неактивний, не схвалювач відділу заявки (AC-APR-03, AC-APR-04);
--   42501 OWN_REQUEST   — автор вирішує власну заявку (AC-APR-05; матриця прав «крім власних»);
--   P0001 NOT_PENDING   — заявка вже вирішена;
--   P0001 NO_REASON     — відхилення без причини (AC-APR-06);
--   22023 INVALID_DECISION — невідоме рішення.
-- Рішення адміністратора за відділ без схвалювача — наступний зріз (примітка під матрицею прав): тут лише схвалювач.

create or replace function private.decide_purchase(p_request_id uuid, p_decision text, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_request public.purchase_requests%rowtype;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
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
  if p_decision is null or p_decision not in ('approve', 'reject') then
    raise exception 'INVALID_DECISION' using errcode = '22023';
  end if;
  if v_request.status <> 'pending' then
    raise exception 'NOT_PENDING';
  end if;

  if p_decision = 'approve' then
    update public.purchase_requests
      set status = 'approved', decided_by = v_uid, decided_at = now()
      where id = p_request_id;
  else
    if v_reason is null then
      raise exception 'NO_REASON';
    end if;
    update public.purchase_requests
      set status = 'rejected', reject_reason = v_reason, decided_by = v_uid, decided_at = now()
      where id = p_request_id;
  end if;
end;
$$;

-- Обгортка для supabase.rpc: security invoker — права перевіряє private.decide_purchase.
create or replace function public.decide_purchase(p_request_id uuid, p_decision text, p_reason text default null)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.decide_purchase(p_request_id, p_decision, p_reason);
$$;

revoke execute on function private.decide_purchase(uuid, text, text) from public, anon;
revoke execute on function public.decide_purchase(uuid, text, text) from public, anon;
grant execute on function private.decide_purchase(uuid, text, text) to authenticated;
grant execute on function public.decide_purchase(uuid, text, text) to authenticated;
