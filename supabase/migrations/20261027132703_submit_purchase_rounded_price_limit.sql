-- Межа ціни після округлення (issue #25, відгук WS7): колонка purchase_request_lines.price — numeric(12, 2), а insert
-- записує round(price, 2). Стара перевірка порівнювала неокруглену ціну з 10 000 000 000, тож 9 999 999 999.995…
-- проходила перевірку, округлювалась до 10 000 000 000.00 і падала на insert з 22003 (numeric_value_out_of_range) —
-- людина бачила загальну помилку замість «Fill in all line fields». Тепер перевіряємо округлену ціну — та сама межа,
-- що PRICE_LIMIT у src/lib/purchase/form.ts. Решта функції — дослівно як у 20261025184732_purchase_requests.sql
-- (застосовану міграцію не редагуємо); обгортка public і права execute — без змін.
-- Межі значень PM (ціла кількість від 1, ціна від 0) — наступний зріз (вимога 47, ValiaBihun/2026-quitcode-dream-team#60).

create or replace function private.submit_purchase(p_department_id uuid, p_purchase_type text, p_lines jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_admin boolean := private.is_admin();
  v_id uuid;
  v_line jsonb;
  v_position integer := 0;
  v_quantity numeric;
  v_price numeric;
begin
  if not private.is_active_user() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if not (v_admin or private.is_member_of(p_department_id)) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_purchase_type is null or p_purchase_type not in ('purchasing_department', 'self_purchase') then
    raise exception 'INVALID_TYPE' using errcode = '22023';
  end if;
  if p_purchase_type = 'self_purchase' and not v_admin and not exists (
    select 1 from public.employee_permissions as e
    where e.profile_id = v_uid and e.permission = 'self_purchase'
  ) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'NO_LINES';
  end if;
  for v_line in select value from jsonb_array_elements(p_lines) loop
    if coalesce(btrim(v_line ->> 'name'), '') = ''
      or coalesce(btrim(v_line ->> 'purpose'), '') = ''
      or coalesce(btrim(v_line ->> 'quantity'), '') = ''
      or coalesce(btrim(v_line ->> 'price'), '') = '' then
      raise exception 'INVALID_LINE';
    end if;
    -- Кількість і ціна — справжні скінченні числа: кількість > 0, ціна ≥ 0 і вміщується в numeric(12, 2) після
    -- округлення до копійок (insert нижче записує round(price, 2)).
    begin
      v_quantity := (v_line ->> 'quantity')::numeric;
      v_price := (v_line ->> 'price')::numeric;
    exception when invalid_text_representation or numeric_value_out_of_range then
      raise exception 'INVALID_LINE';
    end;
    if v_quantity = 'NaN'::numeric or v_quantity = 'Infinity'::numeric or v_quantity <= 0
      or v_price = 'NaN'::numeric or v_price = 'Infinity'::numeric or v_price < 0
      or round(v_price, 2) >= 10000000000 then
      raise exception 'INVALID_LINE';
    end if;
  end loop;

  insert into public.purchase_requests (author_id, department_id, purchase_type)
  values (v_uid, p_department_id, p_purchase_type)
  returning id into v_id;

  for v_line in select value from jsonb_array_elements(p_lines) loop
    v_position := v_position + 1;
    insert into public.purchase_request_lines (request_id, position, name, purpose, quantity, price)
    values (
      v_id,
      v_position,
      btrim(v_line ->> 'name'),
      btrim(v_line ->> 'purpose'),
      (v_line ->> 'quantity')::numeric,
      round((v_line ->> 'price')::numeric, 2)
    );
  end loop;

  return v_id;
end;
$$;
