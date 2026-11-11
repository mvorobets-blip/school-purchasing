# Пропозиція: план реалізації зрізу 3 (WS9) — часткове схвалення, повернення, номер, суми й історія

## Why

Реалізуємо зріз 3 за специфікацією `openspec/specs/approval-decision/spec.md`, `openspec/specs/purchase-history/spec.md`,
`openspec/specs/ui-language/spec.md` (зміна `add-purchase-history`, знімок вимог PM 2026-11-06 — шапка
`docs/conformance.md`). Специфікацію не змінюємо (`skip_specs: true`): ця зміна — лише план.

## What Changes

Покриває 9 AC зрізу 3:

- `approval-decision`: AC-DEC-01, AC-DEC-04, AC-DEC-06, AC-DEC-07;
- `purchase-history`: AC-HIST-01, AC-HIST-02, AC-HIST-06, AC-HIST-10;
- `ui-language`: AC-LANG-09.

Поза AC, але з вимог і припущень PM (регресійні тести без AC ID): кількість — ціле число від 1, ціна — від 0
(ValiaBihun/2026-quitcode-dream-team#64, повідомлення з таблиці #49); номер не змінюється при повторному поданні (#68);
повторне подання — окремий запис «Подано» (#67); «Схвалено» — лише без відхилених рядків.

## Impact

- 5 нових міграцій (по одній на задачу 1–5), лише новими файлами; застосовує `db-deploy`.
- Сторінки `/requests`, `/requests/[id]`, `/approvals`, нова `/requests/[id]/edit`; `src/lib/purchase/*`.
- Нові синтетичні акаунти в `supabase/demo-users.json` (схвалювачі «Марія» й «Петро»); `npm run users:demo` запускає
  розробник.
- Два нові токени статусів у `DESIGN.md` і `src/app/globals.css`.
