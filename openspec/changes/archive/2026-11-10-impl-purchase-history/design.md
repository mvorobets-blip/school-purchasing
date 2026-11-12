# Дизайн: реалізація зрізу 3 (WS9)

## Context

Зріз 2 дав закупівлю як дані (`purchase_requests`, `purchase_request_lines`), подання й рішення лише функціями
`private.submit_purchase` і `private.decide_purchase` (ADR 0002), RLS «бачить автор, схвалювач відділу, адміністратор»
(`purchase_requests_select_visible`), авторизацію лише `getClaims()` (ADR 0003) і англійський інтерфейс. Зріз 3 додає
номер, суми й історію заявки, часткове схвалення, повернення на доопрацювання й повторне подання. Рішення, погоджені
з розробником 05.11.2026, позначено «(погоджено)».

## Goals / Non-Goals

**Goals:** AC-DEC-01, 04, 06, 07; AC-HIST-01, 02, 06, 10; AC-LANG-09; межі кількості й ціни (припущення PM #64).

**Non-Goals** (специфікація, «Non-goals» зміни `add-purchase-history`): записи історії про схвалення, відхилення,
повернення й часткове схвалення; відмови для гостя й чужих поза AC-HIST-10; рішення адміністратора за відділ без
схвалювача; одночасні рішення; скасування, чернетки, копіювання; верхні межі кількості й ціни.

## UI і компоненти

Усе — компонентами `@/components/ui`, правила `DESIGN.md`: одна основна кнопка на екран, `outline` для решти,
`destructive` лише для «Reject»; статус — `Badge` з текстом; відмова — `ForbiddenCard`. Тексти — дослівно з таблиці PM
(ValiaBihun/2026-quitcode-dream-team#49).

| Сторінка | Що додаємо | Стани й тексти | AC |
|---|---|---|---|
| `/requests` «My requests» | колонка «Request» з номером `PUR-n` (`font-mono tabular-nums`) | статуси «Partially approved», «Returned for revision» | AC-HIST-01, AC-LANG-09 |
| `/approvals` «Awaiting decision» | номер у рядку | — | AC-HIST-01 |
| `/requests/[id]` | номер у заголовку; у таблиці рядків — колонки «Sum, USD» і «Line status» («Approved» / «Rejected»), рядок «Total» (усі рядки, зокрема відхилені — #65) (погоджено); причина повернення поруч зі статусом; розділ «History» з записом «Submitted · <ім'я> · 05.11.2026, 14:32» (без імені — email, #74); для автора поверненої — кнопка «Edit» (default) | чужа заявка — та сама `ForbiddenCard` і той самий RLS, що в AC-FRM-08 (історія — розділ сторінки, окремої адреси немає) (погоджено) | AC-HIST-02, 06, 10, AC-DEC-01, 04, AC-LANG-09 |
| `/requests/[id]` для схвалювача (заявка «Awaiting approval», автор — не він) | у таблиці рядків — колонка «Reject line» з прапорцем; одна основна кнопка: жодного прапорця — «Approve», частина — «Partially approve»; поруч «Return for revision» (outline → `Dialog` з причиною) і «Reject» (destructive → `Dialog` з причиною) (погоджено) | усі рядки позначено — «All lines are rejected: reject the whole request», нічого не збережено; повернення без причини — «Provide a reason», статус не змінено | AC-DEC-01, AC-DEC-04, AC-DEC-06 |
| `/requests/[id]/edit` | та сама форма, що `/requests/new`, заповнена рядками заявки; відділ і тип заблоковані (#66); «Submit» (погоджено) | «Add at least one line», «Fill in all line fields», «Quantity: a whole number from 1», «Price: a number from 0»; не автор чи статус не «Returned for revision» — `ForbiddenCard` | AC-DEC-07 |
| Нові токени | `status-partial` (індиго), `status-returned` (бурштиновий) — `DESIGN.md` §9, обидві теми, контраст ≥ 4.5 (погоджено) | — | AC-LANG-09 |

Сума — «60.00»: 2 знаки, без символу валюти в клітинці, заголовок «Sum, USD» (погоджено). Рахуємо в центах цілими
числами (`src/lib/purchase/money.ts`: кількість ціла × ціна в центах), без `float`.

## Дані й RLS

Одна міграція на задачу, лише новим файлом; застосована міграція не редагується; `db-check` → merge → `db-deploy`.

**Задача 1 — `<ts>_request_number_and_line_limits.sql` (AC-HIST-01, AC-HIST-02; межі рядків — припущення PM #64):**

- `purchase_requests.number integer` + послідовність `private.purchase_request_number_seq`; наявним заявкам номери за
  `created_at` (найстаріша — 1), потім `not null` і `unique`; послідовність продовжує з `max(number)` (#73). Номер не
  повторюється й після видалення (послідовність не відкочується).
- Спільна перевірка рядків `private.validate_purchase_lines(jsonb)` (security invoker без доступу до таблиць, `search_path = ''`, без grant — викликає лише `submit_purchase`): усі поля —
  `INVALID_LINE` (AC-FRM-15, як було); кількість — ціле ≥ 1 → `INVALID_QUANTITY`; ціна ≥ 0 і < 10¹⁰ після округлення →
  `INVALID_PRICE`. `private.submit_purchase` викликає її й ставить `number = nextval(...)`. Обмеження таблиці на цілу
  кількість не додаємо: на проді можуть бути дробові рядки зрізу 2 (погоджено).

**Задача 2 — `<ts>_request_history.sql` (AC-HIST-06, AC-HIST-10):**

- `purchase_request_events` (`request_id`, `kind` ∈ {`submitted`}, `actor_id`, `created_at`); `enable row level
  security`; `revoke all … from anon, authenticated`; `grant select` лише `authenticated`; політика `select`: активний
  користувач і `exists` заявки (RLS заявки — автор, схвалювач відділу, адміністратор) — AC-HIST-10; `insert`, `update`,
  `delete` — без `grant` і політики: історія не редагується.
- Подію `submitted` першого подання пише тригер `purchase_requests_submitted_event` (`after insert` на
  `purchase_requests`, `private.add_submitted_event`, `security definer`) — у тій самій транзакції, що й заявка;
  `private.submit_purchase` не перевизначаємо (рев'ю CodeRabbit, PR 59: так подію не загубить і заявка, подана старою
  функцією під час міграції). Повторне подання (задача 5) пише подію в самій `private.resubmit_purchase`. Наявним
  заявкам — подія з `created_at` і автором (backfill без дублікатів).
- `private.request_history(p_request_id)` повертає записи з ім'ям учасника (без імені — email), лише якщо заявку видно
  (як `private.request_author_names`) — AC-HIST-06.
- Порядок записів — `created_at`, потім `id`; коли з'являться події рішень (після WS9), кілька подій в одній транзакції
  матимуть однаковий `now()` — тоді писати їх із `clock_timestamp()` або додати колонку-лічильник (рев'ю задачі 2).

**Задача 3 — `<ts>_partial_approval.sql` (AC-DEC-01, AC-LANG-09):**

- `purchase_requests.status` += `partially_approved`, `returned` (новий check); `purchase_request_lines.status`
  (`null` — не вирішено, `approved`, `rejected`).
- `private.decide_purchase(p_request_id, p_decision, p_reason, p_rejected_positions int[] default '{}')`: ті самі
  перевірки першими рядками (активний, схвалювач відділу, не автор, `pending`); `approve` без позначених — `approved`,
  усі рядки `approved`; з частиною — `partially_approved`, позначені `rejected`, решта `approved` (AC-DEC-01); усі
  позначено — `ALL_LINES_REJECTED`, нічого не змінено; позиції поза заявкою — `INVALID_LINE`. Стару сигнатуру
  прибираємо (`drop function`), обгортка `public` — нова.

**Задача 4 — `<ts>_return_for_revision.sql` (AC-DEC-04, AC-DEC-06, AC-LANG-09):**

- `purchase_requests.return_reason text` (≤ 500, як причина відхилення); check: `returned` завжди з причиною.
- `decide_purchase`: рішення `return` — лише з непорожньою причиною, інакше `NO_REASON` і без змін (AC-DEC-04, AC-DEC-06).

**Задача 5 — `<ts>_resubmit_purchase.sql` (AC-DEC-07; номер не змінюється — AC-HIST-01, #68):**

- `private.resubmit_purchase(p_request_id, p_lines jsonb)`: першими рядками — активний, автор, статус `returned`
  (інакше `FORBIDDEN` без розкриття), ті самі права, що при першому поданні (заявник відділу, дозвіл «Самостійна
  закупівля»); `validate_purchase_lines`; рядки замінюються, статус `pending`, рядкам — `null`,
  відділ, тип і номер — ті самі (#66, #68); подія `submitted` (#67). Обгортка `public.resubmit_purchase`.

Кожне правило відмови — тест PGlite «відмова + дані не змінились» і SQL-мутант у `scripts/mutants.mjs`
(`npm run mutation:sql`).

## Auth

- Без змін у схемі авторизації (AC-HIST-10, AC-DEC-01, AC-DEC-04, AC-DEC-07): `src/proxy.ts` лише перенаправляє
  гостя на `/login`; кожна сторінка й дія — `getCurrentUser()` (`getClaims()` + `profiles`), ніколи `getSession()`
  (ADR 0003).
- Нові й змінені Server Actions (`decidePurchase` з позначеними рядками й рішенням `return` — AC-DEC-01, AC-DEC-04,
  AC-DEC-06; `resubmitPurchase` — AC-DEC-07): `getCurrentUser()` — до будь-якого `rpc` (правило AGENTS.md); права,
  що залежать від даних (схвалювач відділу, автор, статус), перевіряє функція бази в тій самій транзакції.
  Admin-клієнт не потрібен.
- Швидкої відмови за роллю в Server Action навмисно немає (уточнено за зауваженням PM 11, приймання 12.11): дія
  перевіряє лише вхід і активність (`!user` → «Not enough permissions»), а роль — ні, бо `profiles.role = approver`
  означає «схвалювач хоча б одного відділу», а не відділу саме цієї заявки (AC-HIST-10, AC-APR-03), і адміністратор
  теж може бути схвалювачем. Перевірка за роллю в TS дублювала б `private.is_approver_of` і могла б із нею
  розійтися; єдине джерело правди — функція бази, її доводять тести PGlite і мутанти S10, S30
  (`docs/qa/mutation/sql-2026-11-12.md`). Відповідь людині та сама — «Not enough permissions».
- Акаунти для UAT і приймання (AC-DEC-01, AC-DEC-04, AC-DEC-06, AC-HIST-10) — нові синтетичні (погоджено):
  `approver-primary@example.test` (роль «Марія», «Primary School») і `approver-office@example.test` (роль «Петро»,
  лише «Office») у `supabase/demo-users.json`; `npm run users:demo` запускає розробник; відділи призначає
  адміністратор; роль requester / approver рахує база (`private.sync_role`, PR 66).

## Відкладено (рев'ю задачі 5)

- Дата «Submitted» у списках після повторного подання лишається датою першого подання (`created_at`); AC цього не
  визначає. Якщо PM захоче дату останнього подання — колонка `submitted_at`, яку оновлює `resubmit_purchase`.
