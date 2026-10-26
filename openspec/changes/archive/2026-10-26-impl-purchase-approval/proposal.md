# Пропозиція: план реалізації зрізу WS7 — подання закупівлі, рішення схвалювача, англійський інтерфейс

## Why

Реалізуємо другий зріз WS7 за специфікацією `openspec/specs/purchase-form/spec.md`,
`openspec/specs/approval-decision/spec.md`, `openspec/specs/ui-language/spec.md` і змінену вимогу
`openspec/specs/employee-deactivation/spec.md` — знімок вимог PM 2026-10-25 (шапка `docs/conformance.md`).
Специфікацію не змінюємо (`skip_specs: true`): ця зміна — лише план.

## What Changes

Покриває 29 AC зрізу 2 і одну частину першого зрізу:

- `purchase-form`: AC-FRM-01 … AC-FRM-15;
- `approval-decision`: AC-APR-01 … AC-APR-07;
- `ui-language`: AC-LANG-01, AC-LANG-02, AC-LANG-03, AC-LANG-04, AC-LANG-05, AC-LANG-06, AC-LANG-08;
- `employee-deactivation`: вхід деактивованого працівника з повідомленням (частина AC-ORG-12 — «не може увійти»;
  саму деактивацію адміністратором реалізує задача 4.1 плану `impl-department-setup`, тому рядок лишається
  «відкладено»).

Поза AC (задача 6, дизайн за `DESIGN.md`): головна за ролями й зручність форми закупівлі — без нових прав і даних.
