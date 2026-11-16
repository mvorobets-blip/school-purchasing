-- Технічний борг WS9 (/code-review high, 13.11; docs/qa/proof-pack.md, «Технічний борг»): номер PUR-n «згорав»,
-- якщо подання падало на межі довжини назви чи мети рядка. Межу (200 символів) перевіряло лише check-обмеження
-- purchase_request_lines_*_length — уже ПІСЛЯ insert заявки з nextval, а послідовність не відкочується разом із
-- транзакцією. Тепер private.validate_purchase_lines перевіряє довжину до видачі номера (і в повторному поданні —
-- private.resubmit_purchase викликає ту саму функцію). Помилка для застосунку та сама: 23514 і назва обмеження.
-- Решта функції — дослівно як у 20261106162407_request_number_and_line_limits.sql (застосовану міграцію не редагуємо);
-- обмеження таблиці лишаються другим рубежем. Права execute не змінюються (create or replace їх зберігає).

create or replace function private.validate_purchase_lines(p_lines jsonb)
returns void
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_line jsonb;
  v_quantity numeric;
  v_price numeric;
begin
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
    -- Межі тексту рядка (ті самі, що check-обмеження таблиці) — тут, до nextval у private.submit_purchase: інакше
    -- відмова обмеження приходила після видачі номера, і номер «згорав». Код і назва помилки — як у check-обмеження
    -- (23514, purchase_request_lines_*_length): застосунок розпізнає її тим самим isTextLengthError.
    if char_length(btrim(v_line ->> 'name')) > 200 then
      raise exception 'purchase_request_lines_name_length' using errcode = 'check_violation';
    end if;
    if char_length(btrim(v_line ->> 'purpose')) > 200 then
      raise exception 'purchase_request_lines_purpose_length' using errcode = 'check_violation';
    end if;
    begin
      v_quantity := (v_line ->> 'quantity')::numeric;
    exception when invalid_text_representation or numeric_value_out_of_range then
      raise exception 'INVALID_QUANTITY';
    end;
    if v_quantity = 'NaN'::numeric or v_quantity = 'Infinity'::numeric or v_quantity = '-Infinity'::numeric
      or v_quantity < 1 or v_quantity <> trunc(v_quantity) or v_quantity > 2147483647 then
      raise exception 'INVALID_QUANTITY';
    end if;
    begin
      v_price := (v_line ->> 'price')::numeric;
    exception when invalid_text_representation or numeric_value_out_of_range then
      raise exception 'INVALID_PRICE';
    end;
    if v_price = 'NaN'::numeric or v_price = 'Infinity'::numeric or v_price = '-Infinity'::numeric
      or v_price < 0 or round(v_price, 2) >= 10000000000 then
      raise exception 'INVALID_PRICE';
    end if;
  end loop;
end;
$$;
