# Tasks

Вертикальні задачі: кожна — міграція / RLS + доменна функція + server action / сторінка + тест. Одна задача — одна
гілка `task/<коротко>` і один PR «Реалізація». Кожна закінчується рядком «Done when» з AC ID; перевірка — `npm test`,
`npm run ac:coverage`, ручна перевірка на preview демо-користувачами. Для задач 1 і 4 ручна перевірка
обов'язково охоплює: відмову не-адміністратору в прямому записі до `department_members`, `profiles.role` і `profiles.is_active`; відмову
в читанні організаційних даних зі старою сесією деактивованого працівника і те, що його наступний запит до сторінки
завершує сесію й веде на `/login` з помилкою; одночасне зняття ролі двома адміністраторами
(одна дія отримує `LAST_ADMIN`, активним лишається щонайменше один адміністратор). Результати — в описі PR задачі.

## 1. Основа: ролі, відділи, членство, дозволи

- [ ] 1.1 Міграція `<timestamp>_department_setup.sql`: ролі `requester` / `approver` / `admin` (1) drop старого
  `profiles_role_check`; 2) `member` → `requester`; 3) default `requester`; 4) новий constraint; перевірка, що значень
  `member` не лишилось), `profiles.is_active`, таблиці `departments`, `department_members`, `employee_permissions` з RLS і
  GRANT; хелпери `private.is_active_user()`, `private.is_admin()`; тригер `private.sync_role`; сид трьох відділів;
  `supabase/demo-users.json` з новими ролями; `database.types.ts` із Summary `db-check`. Доменна функція
  `roleAfterChange` і тести; ADR `0001-org-data-model.md`. Виправлення `docs/bootstrap.md` (назва репо, репо вимог PM,
  розділ 7) і знімок `docs/img/merge-blocked.png`.
  Done when: AC-ORG-04, AC-ORG-05, AC-ORG-19, AC-ORG-24 — тести `roleAfterChange` зелені; `db-deploy` застосував
  міграцію; `npm run users:demo` створює користувачів із ролями `requester` і `admin`.

## 2. Відділи й доступ до налаштувань

- [ ] 2.1 Сторінка `/admin/departments`: список із позначкою «Немає схвалювача», створення відділу з повідомленням
  про дубль; перевірка доступу на `/admin/**`; `isDuplicateDepartmentName`, `departmentsWithoutApprover`,
  `canAccessSettings`, `messageFor`; тести.
  Done when: AC-ORG-09, AC-ORG-14, AC-ORG-34.

## 3. Заявники, схвалювачі, автосхвалення

- [ ] 3.1 Функції `add_requester`, `remove_requester`, `set_approver`, `set_auto_approve` (`private` + обгортки
  `public`); сторінка `/admin/departments/[id]`; `/profile` (відділи заявника); `checkApproverAssignment`,
  `checkAutoApprove`, `applyRemoveRequester`, `selectableDepartments`; тести.
  Done when: AC-ORG-01, AC-ORG-02, AC-ORG-03, AC-ORG-06, AC-ORG-15, AC-ORG-20, AC-ORG-33.

## 4. Деактивація й захист адміністратора

- [ ] 4.1 Функції `set_active`, `set_admin_role` з блокуванням рядків і кодом `LAST_ADMIN`; сторінки
  `/admin/employees` і `/admin/employees/[id]` (деактивувати / активувати, зняти роль `admin`); перевірка `is_active`
  під час входу й у proxy; `checkLastAdmin`, `approverCandidates`; тести; ADR `0002-admin-actions-via-functions.md`,
  `0003-deactivation-without-service-key.md`.
  Done when: AC-ORG-10, AC-ORG-11, AC-ORG-12, AC-ORG-16, AC-ORG-18, AC-ORG-21, AC-ORG-30, AC-ORG-31, AC-ORG-32.

## 5. Дозволи й заглушка форми заявки

- [ ] 5.1 Видача й зняття дозволів на `/admin/employees/[id]`; дозволені типи в профілі; заглушка `/requests/new`
  (тип заявки, відділ, тип закупівлі, особа «від імені», без збереження); `allowedRequestTypes`,
  `allowedPurchaseTypes`, `onBehalfCandidates`; тести. Запис екрана 1–2 хв на прод-URL у коментарі PR.
  Done when: AC-ORG-17, AC-ORG-22, AC-ORG-23, AC-ORG-25, AC-ORG-26, AC-ORG-27, AC-ORG-28, AC-ORG-29.

## 6. Матриця й завершення зрізу

- [ ] 6.1 Рядки всіх AC зрізу в `docs/conformance.md`: «реалізовано» з шляхами коду й тесту; AC-ORG-13 —
  «відкладено (заявок і чернеток у цьому зрізі немає: форма — заглушка без збереження; реалізуємо разом зі
  збереженням заявок)». `npx openspec archive impl-department-setup -y` в останньому PR задачі.
  Done when: AC-ORG-13 — рядок матриці з причиною відкладення; `npm run ac:coverage` — OK.
