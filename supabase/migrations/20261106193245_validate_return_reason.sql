-- Зріз 3 (WS9), задача 4: перевірка обмежень причини повернення, доданих як «not valid» у
-- 20261106193244_return_for_revision.sql. Окремою міграцією — після фіксації попередньої: VALIDATE CONSTRAINT бере
-- слабше блокування (SHARE UPDATE EXCLUSIVE) і не заважає читанню й запису заявок. Колонка нова, усі наявні значення —
-- null, тож перевірка проходить; далі обмеження діють як звичайні.
alter table public.purchase_requests validate constraint purchase_requests_return_reason_length;
alter table public.purchase_requests validate constraint purchase_requests_return_reason_check;
