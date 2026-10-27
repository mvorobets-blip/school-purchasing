-- Технічні межі довжини тексту в заявках (відгук WS7, «Дрібниці»: «Немає обмежень довжини тексту»). PM меж не задавав —
-- це припущення розробника проти зловживань (дуже довгий текст ламає списки й таблиці), а не правило продукту:
-- назва й мета рядка — до 200 символів, причина відхилення — до 500. Назву відділу вже обмежено 100 символами
-- (departments_name_length, припущення PM у WS6). Ті самі межі — maxLength у полях форми й діалогу «Reject».
-- Обмеження додаємо як NOT VALID (нові записи перевіряються одразу, без сканування таблиці під сильним блокуванням),
-- а наявні рядки перевіряє окремий VALIDATE CONSTRAINT із м'якшим блокуванням. Якщо на проді знайдеться довший рядок,
-- db-deploy зупиниться з помилкою й нічого не змінить (транзакція міграції) — тоді спершу розібратися з даними.

alter table public.purchase_request_lines
  add constraint purchase_request_lines_name_length check (char_length(name) <= 200) not valid,
  add constraint purchase_request_lines_purpose_length check (char_length(purpose) <= 200) not valid;

alter table public.purchase_requests
  add constraint purchase_requests_reject_reason_length
    check (reject_reason is null or char_length(reject_reason) <= 500) not valid;

alter table public.purchase_request_lines validate constraint purchase_request_lines_name_length;
alter table public.purchase_request_lines validate constraint purchase_request_lines_purpose_length;
alter table public.purchase_requests validate constraint purchase_requests_reject_reason_length;
