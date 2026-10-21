# Design: impl-department-setup

## Context

- Специфікація: `openspec/specs/department-setup/spec.md`, `openspec/specs/employee-deactivation/spec.md`,
  `openspec/specs/permissions-access/spec.md` — 32 AC (AC-ORG-01 … AC-ORG-34 без 07 і 08), знімок вимог 2026-10-21.
- Відповіді PM на Q1–Q5 уже в тексті вимог і специфікації (AC-ORG-30 … 34, «Правило ролей» у `requirements/product.md`).
- Стартова база шаблону: `public.profiles` (ролі `member`/`admin`), хелпер `private.current_app_role()`, тригер
  `private.handle_new_user()` (міграція `20261012000000_profiles_and_roles.sql`).
- Стек фіксований (`AGENTS.md`): Next.js 16 App Router без Cache Components, Supabase без Docker (міграції застосовує
  лише CI `db-deploy`), Vitest для юніт-тестів. У Vercel є лише публічні змінні — секретного ключа (`SUPABASE_SECRET_KEY`)
  у застосунку немає, тож усе робимо від імені користувача під RLS.

## Goals / Non-Goals

**Goals:**

- Кожен AC зрізу (крім AC-ORG-13): код + тест з AC ID у назві + рядок «реалізовано» в `docs/conformance.md`.
- Правила ролей і «хоча б один активний адміністратор» тримає **база** (тригери й функції), а не лише UI:
  перевірка роботи з двох вкладок чи прямим запитом до Data API не обходить правил.
- Права з матриці `requirements/product.md`: RLS на кожній таблиці, явні GRANT, жодних прямих UPDATE ролі клієнтом.

**Non-Goals:**

- Створення користувачів Auth і запрошення: «порядок видачі запрошень» — поза межами вимог; без секретного ключа
  застосунок не може створювати користувачів. Працівників створює `npm run users:demo` (`supabase/demo-users.json`),
  а адміністратор у застосунку налаштовує вже наявних.
- AC-ORG-13: заявок і чернеток у зрізі немає (форма — заглушка), тож рядок матриці — «відкладено (заявок і чернеток
  у цьому зрізі немає: форма — заглушка без збереження; реалізуємо разом зі збереженням заявок)».
- Перейменування й видалення відділів, історія змін налаштувань, листи (Non-goals PM).
- Тести бази в CI (pgTAP потребує Docker і `supabase start`): правила бази перевіряє `db-check` (міграції
  застосовуються), а поведінку — юніт-тести доменних функцій, які дублюють правила бази; див. Risks.
  Замість тестів бази — обов'язкова ручна перевірка на preview (задачі 1 і 4): відмова не-адміністратору в прямому
  записі до `department_members`, `profiles.role` і `profiles.is_active`; відмова в читанні організаційних даних зі старою сесією
  деактивованого працівника, а його наступний запит до сторінки завершує сесію й веде на `/login` з помилкою; одночасне зняття ролі двома адміністраторами — одна дія отримує `LAST_ADMIN`, активним
  лишається щонайменше один адміністратор. Також: не-адміністратор через Data API не отримує рядків
  `departments` відділів, де він не має членства.

## Decisions

### 1. Модель даних (одна нова міграція `<timestamp>_department_setup.sql`)

| Таблиця / колонка | Ключові поля | AC |
|---|---|---|
| `profiles.role` | ролі `requester` / `approver` / `admin`; default `requester`; порядок у міграції — див. нижче | 04, 05, 11, 19–21, 24, 31, 32 |
| `profiles.is_active` | `boolean not null default true` | 10, 12, 14, 16, 18, 28, 30 |
| `departments` | `id uuid`, `name text` (1–100 символів), унікальний індекс `lower(name)` | 14, 34 |
| `department_members` | PK (`department_id`, `profile_id`); `is_approver bool`, `auto_approve bool` | 01–06, 14, 15, 19, 20, 24, 30, 33 |
| `employee_permissions` | PK (`profile_id`, `permission`); `permission` ∈ `card_expense`, `check_request`, `vendor_bill`, `self_purchase` | 17, 25–27 |

- **Порядок зміни ролей у міграції** (як у шапці стартової міграції): 1) `drop constraint profiles_role_check` —
  старе правило не пропустить нові значення; 2) `update … set role = 'requester' where role = 'member'`;
  3) `alter column role set default 'requester'` — інакше тригер `on_auth_user_created` вставить `member`;
  4) новий `profiles_role_check` з `requester`, `approver`, `admin`.
- **Рядок `department_members` = членство заявника.** Схвалення й автосхвалення — прапорці того самого рядка, тож
  схвалювачем чи з автосхваленням не можна бути без членства (AC-ORG-02, AC-ORG-33), а видалення рядка знімає і
  схвалення, і автосхвалення (AC-ORG-03, AC-ORG-15). Повідомлення «Спершу додайте працівника до відділу як заявника»
  дає функція, коли рядка немає.
- **Роль `approver` / `requester` рахує база** (тригер `private.sync_role` після змін `department_members` і після
  зняття ролі `admin`): працівник без ролі `admin` — `approver`, якщо хоча б в одному рядку `is_approver`, інакше
  `requester` («Правило ролей»; AC-ORG-04, 05, 19, 24, 31, 32, 21). Роль `admin` тригер не чіпає (AC-ORG-11, AC-ORG-20).
- **Деактивація лише ставить `is_active = false`**: членство, прапорці, дозволи й роль не змінюються, тож після
  повторної активації все діє, як було (відповідь PM на Q1; AC-ORG-30). «Немає схвалювача» = у відділі немає рядка з
  `is_approver` і активним профілем (AC-ORG-14).
- **Дубль назви** ловить унікальний індекс `lower(name)`; помилку `23505` дія перекладає в «Відділ з такою назвою вже
  є» (AC-ORG-34).
- Тип закупівлі «Відділ закупівель» доступний усім, «Самостійна закупівля» — з дозволом `self_purchase` або
  адміністратору (AC-ORG-23, AC-ORG-27).

### 2. Права: GRANT + RLS

| Таблиця | select | insert | update | delete |
|---|---|---|---|---|
| `profiles` | власний / admin (як у шаблоні) | — (тригер) | лише `full_name` власного (шаблон); роль і `is_active` — тільки функції `private` | — |
| `departments` | відділи, де користувач має членство (`private.is_member_of(id)`) / admin | admin | — | — |
| `department_members` | власні рядки / admin | лише через функції | лише через функції | лише через функції |
| `employee_permissions` | власні / admin | admin | — | admin |

- Хелпери в `private` (`security definer`, `set search_path = ''`): `current_app_role()` (шаблон),
  `is_active_user()`, `is_admin()` = активний і `admin`, `is_member_of(department_id)` — є рядок `department_members` для
  `auth.uid()` (хелпер, а не підзапит у політиці, щоб політики `departments` ↔ `department_members` не зациклились, 42P17). Усі політики вимагають `private.is_active_user()`: JWT
  деактивованого працівника, виданий до деактивації, нічого не прочитає (AC-ORG-12).
- **Зміни, що зачіпають роль чи захист адміністратора, — лише через функції** `private.*` (`security definer`), які
  самі перевіряють `private.is_admin()`; клієнт викликає їх через тонкі обгортки `public.*` (`security invoker`) і
  `supabase.rpc(…)`: `add_requester`, `remove_requester`, `set_approver`, `set_auto_approve`, `set_admin_role`,
  `set_active`. Прямих GRANT на insert / update / delete `department_members` і `profiles.role` клієнт не має.
- **«Хоча б один активний адміністратор»** (AC-ORG-10, AC-ORG-18, AC-ORG-21): `set_admin_role(false)` і
  `set_active(false)` блокують рядки активних адміністраторів (`select … for update`) і рахують інших; якщо інших
  немає — виняток з кодом `LAST_ADMIN`, який дія перекладає в «Має лишитись хоча б один активний адміністратор».
  Блокування закриває гонку двох адміністраторів, що знімають роль одночасно.

### 3. Доменні функції (`src/lib/org/*.ts`, без бази — їх покривають юніт-тести)

| Функція | Що робить | AC |
|---|---|---|
| `roleAfterChange(member)` | «Правило ролей»: `admin` лишається; інакше `approver`, якщо схвалює хоча б один відділ | 04, 05, 11, 19, 20, 21, 24, 31, 32 |
| `checkApproverAssignment`, `checkAutoApprove` | без членства заявника — `NOT_REQUESTER` | 02, 33 |
| `applyRemoveRequester` | прибирає членство разом зі схваленням і автосхваленням | 03, 15, 24 |
| `checkLastAdmin` | `LAST_ADMIN`, якщо після дії не лишиться активного адміністратора | 10, 18, 21 |
| `isDuplicateDepartmentName` | порівняння без урахування регістру | 34 |
| `departmentsWithoutApprover` | відділи без активного схвалювача | 14 |
| `allowedRequestTypes`, `allowedPurchaseTypes` | типи за дозволами; адміністратору — усі | 17, 23, 25, 26, 27 |
| `selectableDepartments` | не-адміністратор — свої відділи; адміністратор — усі | 01, 22, 29 |
| `approverCandidates`, `onBehalfCandidates` | без деактивованих | 16, 28 |
| `canAccessSettings` | лише `admin` | 09 |
| `messageFor(code)` | коди → тексти повідомлень PM дослівно | 02, 09, 10, 18, 33, 34 |

Server actions (`src/app/**/actions.ts`) перевіряють користувача через `getClaims()`, викликають доменну функцію
для раннього повідомлення й `supabase.rpc(…)` / запит під RLS; помилки бази (`LAST_ADMIN`, `NOT_REQUESTER`, `23505`)
перекладають через `messageFor`.

### 4. Сторінки

| Шлях | Хто | Що | AC |
|---|---|---|---|
| `/admin/departments` | admin | список відділів з позначкою «Немає схвалювача»; створення відділу | 14, 34 |
| `/admin/departments/[id]` | admin | заявники, схвалювачі, автосхвалення відділу: додати / прибрати | 01–06, 15, 19, 20, 24, 33 |
| `/admin/employees` | admin | список працівників: активний / деактивований, роль | 10, 12, 18, 30 |
| `/admin/employees/[id]` | admin | профіль: відділи заявника, дозволи, роль `admin`, деактивація | 01, 11, 17, 21, 25–27, 31, 32 |
| `/profile` | усі | власний профіль лише для читання: відділи й дозволені типи | 01 |
| `/requests/new` | усі | **заглушка** форми: тип заявки, відділ, тип закупівлі, особа «від імені»; нічого не зберігає | 22, 23, 28, 29 |

- `/admin/**` для не-адміністратора показує «Недостатньо прав» (без редіректу), а RLS однаково не віддає даних
  (AC-ORG-09).
- Вхід (`src/app/login/actions.ts`) і `src/proxy.ts`: після `getClaims()` читаємо `is_active` **не запитом до
  `profiles`** (RLS деактивованому його не віддасть), а RPC `public.am_i_active()` (`security invoker`) → хелпер
  `private.is_active_user()` (`security definer`). Якщо результат `false` або профілю немає — `signOut()` (очищує
  cookie сесії) і redirect на `/login?error=inactive` з повідомленням про недоступний вхід (AC-ORG-12).
- Демо-дані: ролі в `supabase/demo-users.json` → `requester` / `admin`; сид — відділи «Початкова школа», «Вища школа»,
  «Офіс» (`insert … on conflict do nothing` у новій міграції, бо сид у хмарі вже виконано).

## Рішення для ADR (`docs/decisions/`, у PR «Реалізація» відповідної задачі)

- `0001-org-data-model.md` — один рядок членства з прапорцями замість окремих таблиць заявників і схвалювачів; роль
  рахує тригер (задача 1).
- `0002-admin-actions-via-functions.md` — зміни ролей і захист останнього адміністратора лише через функції
  `private` з блокуванням рядків (задачі 1, 4).
- `0003-deactivation-without-service-key.md` — `is_active` + RLS + перевірка під час входу замість бану в Auth
  (секретного ключа в застосунку немає) (задача 4).

## Risks / Trade-offs

- [Тестів бази в CI немає] → доменні функції дублюють правила тригерів і функцій; `db-check` перевіряє, що міграція
  застосовується; ручна перевірка трьома демо-користувачами на preview — у PR кожної задачі.
- [JWT деактивованого працівника дійсний до закінчення терміну] → RLS вимагає `is_active_user()`, а proxy виходить із
  сесії на першому запиті.
- [Тригер ролі й функції `security definer` — складніші для рев'ю] → кожна функція в `private`, `search_path = ''`,
  `revoke execute … from public, anon`; ADR пояснює чому.
