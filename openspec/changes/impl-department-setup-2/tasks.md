# Задачі: завершення першого зрізу

## 4. Деактивація й захист адміністратора — `task/employee-deactivation`

- [ ] 4.1 Міграція `<timestamp>_employee_deactivation.sql`: `private.set_active`, `private.remove_admin_role` з
  блокуванням рядків адміністраторів і кодом `LAST_ADMIN`, обгортки `public.*`; сторінки `/admin/employees` і
  `/admin/employees/[id]` (деактивувати / активувати, зняти роль `admin`); пункт «Employees»; лише активні в
  `approverCandidates`; тести бази й дій; рядки `docs/conformance.md`.
  Done when: AC-ORG-10, AC-ORG-12, AC-ORG-16, AC-ORG-18, AC-ORG-21, AC-ORG-30, AC-ORG-31, AC-ORG-32 «реалізовано»;
  `db-check` застосовує міграцію на чисту базу.

## 5. Дозволи — `task/employee-permissions`

- [ ] 5.1 Видача й зняття дозволів на `/admin/employees/[id]`; дозволені типи заявок і закупівлі в профілі працівника;
  тести бази (видає лише адміністратор) і сторінки; AC ID у тестах форми закупівлі для AC-ORG-22, 29; рядки
  `docs/conformance.md`; archive `impl-department-setup-2`.
  Done when: AC-ORG-17, AC-ORG-22, AC-ORG-26, AC-ORG-27, AC-ORG-29 «реалізовано»; AC-ORG-28 — «відкладено (рішення PM, #46)».
