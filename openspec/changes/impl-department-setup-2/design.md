# Дизайн: деактивація, захист адміністратора й дозволи

## Context

Таблиці й RLS уже є (міграція `20261021213618_department_setup.sql`): `profiles.is_active`, `employee_permissions`
(insert / delete — лише адміністратор), усі політики вимагають `private.is_active_user()`. Роль `approver` / `requester`
рахує тригер `private.sync_role`, роль `admin` він не чіпає. Зміни ролей — лише через функції `private.*` (ADR 0002).

## Decisions

### 1. Міграція `<timestamp>_employee_deactivation.sql` (задача 4.1)

| Функція (`private.*` + обгортка `public.*`, `security invoker`) | Що робить | AC |
|---|---|---|
| `set_active(p_profile_id uuid, p_active boolean) returns void` | лише адміністратор; ставить `is_active`; деактивація останнього активного адміністратора → `LAST_ADMIN` | 12, 18, 30 |
| `remove_admin_role(p_profile_id uuid) returns void` | лише адміністратор; знімає роль `admin`: роль стає `requester`, потім `private.sync_role` (схвалює відділ → `approver`); останній активний адміністратор → `LAST_ADMIN` | 10, 21, 31, 32 |

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

### 3. Сторінки

| Шлях | Що | AC |
|---|---|---|
| `/admin/employees` | список: ім'я, email, роль, активний / деактивований | 09, 12, 30 |
| `/admin/employees/[id]` | профіль: деактивувати / активувати, зняти роль `admin`, відділи, дозволи (вкл. / вимк.), дозволені типи заявок і закупівлі | 10, 12, 17, 18, 21, 25–27, 30–32 |
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
