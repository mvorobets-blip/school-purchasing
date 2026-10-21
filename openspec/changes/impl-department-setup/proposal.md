# Пропозиція: план реалізації зрізу WS6 — відділи, схвалювачі, деактивація, дозволи

## Why

Реалізуємо перший зріз WS6 (область ORG) за специфікацією `openspec/specs/department-setup/spec.md`,
`openspec/specs/employee-deactivation/spec.md` і `openspec/specs/permissions-access/spec.md` — знімок вимог PM
2026-10-21 (шапка `docs/conformance.md`). Специфікацію не змінюємо (`skip_specs: true`): ця зміна — лише план.

## What Changes

Покриває 32 AC зі специфікацій:

- `department-setup`: AC-ORG-01, AC-ORG-02, AC-ORG-03, AC-ORG-04, AC-ORG-05, AC-ORG-06, AC-ORG-14, AC-ORG-15,
  AC-ORG-19, AC-ORG-20, AC-ORG-24, AC-ORG-33, AC-ORG-34;
- `employee-deactivation`: AC-ORG-10, AC-ORG-11, AC-ORG-12, AC-ORG-13, AC-ORG-16, AC-ORG-18, AC-ORG-21, AC-ORG-28,
  AC-ORG-30, AC-ORG-31, AC-ORG-32;
- `permissions-access`: AC-ORG-09, AC-ORG-17, AC-ORG-22, AC-ORG-23, AC-ORG-25, AC-ORG-26, AC-ORG-27, AC-ORG-29.

AC-ORG-13 (видалення чернетки деактивованого працівника) у цьому зрізі лишається «відкладено»: заявок і чернеток ще
немає — форма заявки є заглушкою без збереження (припущення PM); див. `design.md`, «Non-Goals».
