# Дизайн: реалізація зрізу WS7

## Context

Зріз 2 додає закупівлю як дані: форма подання з урахуванням прав працівника, сторінка «Мої заявки», список для
рішення схвалювача й рішення (схвалити / відхилити з причиною), а весь інтерфейс — англійською за таблицею PM. Основа
— модель першого зрізу (`profiles`, `departments`, `department_members`, `employee_permissions`, хелпери
`private.is_active_user()`, `private.is_admin()`, `private.is_member_of()`), дизайн-система (`DESIGN.md`, PR
«Реалізація» дизайн-системи) і правила `AGENTS.md`: RLS на кожній таблиці, `revoke all` + явні `grant`, політика на
кожну операцію, привілейовані дії — функціями в `private` (`security definer`, `search_path = ''`) з тонкою
обгорткою `public` (`security invoker`).

## Goals / Non-Goals

**Goals:** AC-FRM-01 … 15, AC-APR-01 … 07, AC-LANG-01 … 06, 08; блок входу деактивованого працівника (AC-ORG-12, частина).

**Non-Goals:** номер заявки, історія, суми й ліміти рядків, часткове схвалення, повернення на доопрацювання,
рішення адміністратора за відділ без схвалювача, інші типи заявок, «від імені» й автосхвалення в заявках, перемикач
мов (специфікація, «Non-goals» зміни `add-purchase-approval`); AC-LANG-07 — у зрізі з історією (рішення PM
ValiaBihun/2026-quitcode-dream-team#57).

## UI і компоненти

Усе — компонентами `@/components/ui` (shadcn/ui), токени й правила `DESIGN.md`: одна основна (суцільна) кнопка на
екран, `outline` для решти, `destructive` (червона межа) лише для незворотного, статуси — `Badge` з текстом і
`bg-status-*`, «Not enough permissions» — нейтральний `Alert`.

| Сторінка | Компоненти | Стани (тексти дослівно з AC / таблиці PM) | AC |
|---|---|---|---|
| `/requests/new` «New purchase» | `Card`, `Label`, `Select` (відділ, тип — керовані, лишаються після помилки), `Input` (назва, мета, кількість, ціна), `Button` «Add line» (outline), «Submit» (default) | без відділів — `Alert` «You have not been added to any department. Contact your administrator.» без полів; «Add at least one line»; «Fill in all line fields»; «Not enough permissions» (нейтральний) | FRM-01, 03, 05, 06, 15, LANG-04 |
| `/requests` «My requests» | `Table`, `StatusBadge`, `Button` «New purchase» | після подання — `Alert` «Purchase submitted»; порожній стан «You have not submitted any requests yet» | FRM-10, 11, 14, LANG-06 |
| `/requests/[id]` | `Card` (відділ, тип, статус), `Table` рядків | чужа чи неіснуюча — «Not enough permissions» без даних; «Rejection reason» поруч зі статусом «Rejected» | FRM-08, APR-03, APR-07 |
| `/approvals` «Awaiting decision» | `Table`, «Approve» (default), «Reject» (destructive) → `Dialog` з `Textarea` причини | не схвалювач — «Not enough permissions» без заявок; порожній — «No requests awaiting your decision»; «Provide a reason» | APR-01, 02, 04, 06, 07, LANG-05 |
| Бічна панель | розділ «Requests»: «New purchase», «My requests», «Awaiting decision» — лише схвалювачам | — | APR-04 |
| `/login` | як у дизайн-системі | «Incorrect email or password.»; деактивований — «Account deactivated. Contact your administrator» | LANG-02, ORG-12 |

Англійський інтерфейс (AC-LANG-01 … 06, 08): тексти з таблиці PM — у `src/lib/org/messages.ts` і підписах
(`ROLE_LABEL`, `STATUS_LABEL`, `PURCHASE_TYPE_LABEL`); `lang="en"`; дані людей (назви відділів, причини) — без
перекладу; ідентифікатори ролей — без змін поруч із підписом.

## Дані й RLS

Дві нові міграції (лише новими файлами, у PR відповідних задач; застосовує `db-deploy`):

**`<ts>_purchase_requests.sql` (задача 1):**

- `purchase_requests` (`author_id`, `department_id`, `purchase_type` ∈ {`purchasing_department`, `self_purchase`},
  `status` ∈ {`pending`, `approved`, `rejected`} default `pending`, `reject_reason`, `decided_by`, `decided_at`;
  check: відхилена завжди з причиною) і `purchase_request_lines` (`name`, `purpose`, `quantity`, `price` numeric(12,2),
  check непорожніх назви й мети).
- `enable row level security`; `revoke all … from anon, authenticated`; за операціями: `select` — `grant` лише
  `authenticated` + політика нижче; `insert`, `update`, `delete` — без `grant` і без політики, тож статус, автора й
  відділ користувач напряму не змінює (FRM-02, 04, 08; APR-05).
- Політика `select`: активний користувач і (автор, або адміністратор, або схвалювач відділу заявки через новий
  хелпер `private.is_approver_of(dept)`) — FRM-08, FRM-10, APR-03; рядки — видно тому, хто бачить заявку.
- `private.submit_purchase(dept, type, lines jsonb)` (`security definer`, `search_path = ''`): першими рядками —
  активний; заявник відділу або адміністратор (FRM-02, ORG-22, 29); `self_purchase` — з дозволом або адміністратор
  (FRM-04, ORG-23); ≥ 1 рядок (FRM-06); усі чотири поля кожного рядка (FRM-15); статус `pending` незалежно від
  наявності схвалювача (FRM-12, 13). Обгортка `public.submit_purchase` (`security invoker`), `grant execute` лише
  `authenticated`.

**`<ts>_purchase_decisions.sql` (задача 2):**

- `private.decide_purchase(id, decision, reason)`: активний; схвалювач відділу заявки — інакше `FORBIDDEN`, без
  розкриття, чи заявка існує (APR-03, 04); не автор — `OWN_REQUEST` (APR-05); лише зі статусу `pending`; відхилення —
  з непорожньою причиною (APR-06, 07). Обгортка `public.decide_purchase`.
- Рішення адміністратора — наступний зріз (примітка під матрицею прав): у функції лише схвалювач.

## Auth

- `src/proxy.ts` лише перенаправляє гостя на `/login` (FRM-09); захист — у кожній сторінці й дії.
- Кожна Server Action (`submitPurchase`, `decidePurchase`, дії налаштувань): `getCurrentUser()` = `getClaims()` +
  роль і `is_active` з `profiles` (ніколи `user_metadata`, ніколи `getSession()`); немає користувача — помилка без
  запису; запис — серверним клієнтом користувача через `supabase.rpc`, тож діють RLS, GRANT і перевірки функцій.
  Admin-клієнт (`SUPABASE_SECRET_KEY`) у зрізі не потрібен.
- Вхід (`login`): після `signInWithPassword` читаємо власний профіль; RLS не віддає профіль неактивному → `signOut` і
  `/login?error=inactive` з повідомленням PM (ORG-12, частина).
- Правило архітектури: `getSession()` заборонено в `src/` — скрипт `scripts/check-no-get-session.mjs`, job у
  `.github/workflows/architecture.yml` (ADR `0003`).

## Рішення для ADR

Одне рішення — один ADR:

- `docs/decisions/0002-privileged-writes-via-db-functions.md` — подання й рішення лише функціями бази в `private`
  з обгорткою `public`, без прямих `insert` / `update` для `authenticated`; перевіряють тести бази на PGlite.
- `docs/decisions/0003-server-auth-via-get-claims.md` — авторизація на сервері лише `getClaims()` + роль з
  `profiles`, ніколи `getSession()`; перевіряє job `architecture.yml`.

## Risks / Trade-offs

- Помилки функцій розпізнаємо за кодом (`42501`) і текстом (`NO_LINES`, `INVALID_LINE`, `NO_REASON`, `OWN_REQUEST`):
  зміна тексту в міграції без зміни дії зламає повідомлення — покрито тестами дій із підміненим `rpc`.
- PGlite емулює Auth спрощено (`auth.uid()` з `request.jwt.claim.sub`): політики й функції перевіряються, налаштування
  хмарного проєкту — ні; ручна перевірка на проді демо-користувачами.
- Перевірка AC-LANG-01 — скан коду `src/` на кирилицю поза коментарями: нові тексти українською CI не пропустить, але
  тексти з бази (назви відділів) — дані людей, їх не перекладаємо.
