-- Зріз 3 (WS9), задача 5 плану impl-purchase-history: повторне подання поверненої заявки (AC-DEC-07).
-- Поки заявка «Повернено на доопрацювання», автор змінює поля рядків, додає й прибирає рядки; відділ і тип ті самі
-- (відповідь PM на #66). Повторне подання перевіряє рядки так само, як перше (private.validate_purchase_lines), дає
-- «Очікує схвалення» в тому самому відділі, номер не змінюється (#68), в історії — ще один запис «Подано» (#67).
-- Помилки:
--   42501 FORBIDDEN — неактивний; заявки немає, вона не власна чи не «Повернено на доопрацювання» (без розкриття, що саме);
--   P0001 NO_LINES / INVALID_LINE / INVALID_QUANTITY / INVALID_PRICE — як при першому поданні.
-- Будь-яка помилка — нічого не змінено (одна транзакція).

create function private.resubmit_purchase(p_request_id uuid, p_lines jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_request public.purchase_requests%rowtype;
  v_line jsonb;
  v_position integer := 0;
begin
  if not private.is_active_user() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  select * into v_request from public.purchase_requests where id = p_request_id for update;
  if not found or v_request.author_id <> v_uid or v_request.status <> 'returned' then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  perform private.validate_purchase_lines(p_lines);

  delete from public.purchase_request_lines where request_id = p_request_id;
  for v_line in select value from jsonb_array_elements(p_lines) loop
    v_position := v_position + 1;
    insert into public.purchase_request_lines (request_id, position, name, purpose, quantity, price)
    values (
      p_request_id,
      v_position,
      btrim(v_line ->> 'name'),
      btrim(v_line ->> 'purpose'),
      (v_line ->> 'quantity')::numeric,
      round((v_line ->> 'price')::numeric, 2)
    );
  end loop;

  -- Відділ, тип, номер, автор і дата першого подання — без змін; рішення попереднього кола знято.
  update public.purchase_requests
    set status = 'pending', return_reason = null, decided_by = null, decided_at = null
    where id = p_request_id;

  insert into public.purchase_request_events (request_id, kind, actor_id)
  values (p_request_id, 'submitted', v_uid);

  return p_request_id;
end;
$$;

-- Обгортка для supabase.rpc: security invoker — права перевіряє private.resubmit_purchase.
create function public.resubmit_purchase(p_request_id uuid, p_lines jsonb)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.resubmit_purchase(p_request_id, p_lines);
$$;

revoke execute on function private.resubmit_purchase(uuid, jsonb) from public, anon;
revoke execute on function public.resubmit_purchase(uuid, jsonb) from public, anon;
grant execute on function private.resubmit_purchase(uuid, jsonb) to authenticated;
grant execute on function public.resubmit_purchase(uuid, jsonb) to authenticated;
