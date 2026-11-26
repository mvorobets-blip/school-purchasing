# Дизайн: деактивація, захист адміністратора й дозволи

## Context

Таблиці й RLS уже є (міграція `20261021213618_department_setup.sql`): `profiles.is_active`, `employee_permissions`
(insert / delete — лише адміністратор), усі політики вимагають `private.is_active_user()`. Роль `approver` / `requester`
рахує тригер `private.sync_role`, роль `admin` він не чіпає. Зміни ролей — лише через функції `private.*` (ADR 0002).

## Decisions

### 1. Міграція `<timestamp>_employee_deactivation.sql` (задача 4.1)

| Функція (`private.*` — `security definer`; обгортка `public.*` — `security invoker`) | Що робить | AC |
|---|---|---|
| `set_active(p_profile_id uuid, p_active boolean) returns void` | лише адміністратор; ставить `is_active`; деактивація останнього активного адміністратора → `LAST_ADMIN` | AC-ORG-12, AC-ORG-18, AC-ORG-30 |
| `remove_admin_role(p_profile_id uuid) returns void` | лише адміністратор; знімає роль `admin`: роль стає `requester`, потім `private.sync_role` (схвалює відділ → `approver`); останній активний адміністратор → `LAST_ADMIN` | AC-ORG-10, AC-ORG-21, AC-ORG-31, AC-ORG-32 |

- **Режим і права (ADR 0002):** `private.set_active` і `private.remove_admin_role` — `security definer`,
  `set search_path = ''`, на початку перевіряють `private.is_admin()`; `revoke execute … from public, anon`,
  `grant execute … to authenticated`. Обгортки `public.*` з тією самою сигнатурою — `security invoker`,
  `revoke execute … from public, anon`, `grant execute … to authenticated`. Хелпер блокування адміністраторів —
  `revoke execute … from public, anon, authenticated` (викликають лише функції `private.*`). Нових таблиць і
  політик RLS немає.
- **Гонка двох адміністраторів:** перед перевіркою функція блокує рядки всіх активних адміністраторів
  (`select … for update`), тож дві одночасні дії не залишать школу без адміністратора — друга побачить уже оновлений
  стан і отримає `LAST_ADMIN`.
- Деактивація лише ставить `is_active = false` — членство, схвалення, дозволи й роль не змінюються (AC-ORG-30).
- Помилки: `FORBIDDEN` (42501), `LAST_ADMIN` (P0001, повідомлення = код) → «At least one active administrator must
  remain» (таблиця вимоги 49). Невідомий працівник → `NOT_FOUND`.
- Видача ролі `admin` — поза вимогами PM (39: «знімає роль адміністратора»), у плані її немає.

### 2. Дозволи (задача 5.1) — без міграції

Видача й зняття — `insert` / `delete` у `employee_permissions` під наявними політиками `…_insert_admin` /
`…_delete_admin`. Дозволені типи — наявні `requestTypeAccess` і `purchaseTypeAccess` (`src/lib/org/permissions.ts`).

AC: AC-ORG-17, AC-ORG-26 (типи заявок), AC-ORG-27 (типи закупівлі) у профілі працівника; AC-ORG-25 — адміністратор без дозволу.

### 3. Сторінки

| Шлях | Що | AC |
|---|---|---|
| `/admin/employees` | список: ім'я, email, роль, активний / деактивований | AC-ORG-09, AC-ORG-12, AC-ORG-30 |
| `/admin/employees/[id]` | профіль: деактивувати / активувати, зняти роль `admin`, відділи, дозволи (вкл. / вимк.), дозволені типи заявок і закупівлі | AC-ORG-10, 12, 17, 18, 21, 25–27, 30–32 (усі — `AC-ORG-…`) |
| `/admin/departments/[id]` | у виборі заявника й схвалювача — лише активні працівники | 16 |

Пункт «Employees» у бічній панелі — лише адміністратору (як «Departments»).

### 4. Тести

- База (PGlite, `tests/db/employee-deactivation.test.ts`): AC-ORG-10, 12 (RLS не віддає даних деактивованому), 18,
  21, 30, 31, 32; відмова не-адміністратору; відмовні тести перевіряють, що дані не змінились. Мутанти — вручну
  (без перевірки `LAST_ADMIN`, без `sync_role`).
- Дії з замоканим `rpc` (`tests/org/employee-actions.test.ts`): `LAST_ADMIN` доходить до адміністратора текстом PM.
- AC-ORG-16: `approverCandidates` (лише активні) + тест.
- База для дозволів: адміністратор видає й забирає, не-адміністратор — ні; AC-ORG-17, 26, 27 — тест сторінки профілю.

## Risks / Trade-offs

- [JWT деактивованого дійсний до закінчення] → RLS не віддає йому даних, `getCurrentUser` повертає `null` → вхід.
- [Злиття в `main` міняє прод] → PR не зливаємо до оцінки WS11 (здача WS11 посилається на SHA проду).
