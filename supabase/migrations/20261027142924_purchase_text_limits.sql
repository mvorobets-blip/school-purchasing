-- Технічні межі довжини тексту в заявках (відгук WS7, «Дрібниці»: «Немає обмежень довжини тексту»). PM меж не задавав —
-- це припущення розробника проти зловживань (дуже довгий текст ламає списки й таблиці), а не правило продукту:
-- назва й мета рядка — до 200 символів, причина відхилення — до 500. Назву відділу вже обмежено 100 символами
-- (departments_name_length, припущення PM у WS6). Ті самі межі — maxLength у полях форми й діалогу «Reject».
-- Обмеження додаємо з перевіркою наявних даних: якщо на проді знайдеться довший рядок, db-deploy зупиниться з помилкою
-- обмеження й нічого не змінить (транзакція міграції) — тоді спершу розібратися з даними, а не послаблювати межу.

alter table public.purchase_request_lines
  add constraint purchase_request_lines_name_length check (char_length(name) <= 200),
  add constraint purchase_request_lines_purpose_length check (char_length(purpose) <= 200);

alter table public.purchase_requests
  add constraint purchase_requests_reject_reason_length check (reject_reason is null or char_length(reject_reason) <= 500);
