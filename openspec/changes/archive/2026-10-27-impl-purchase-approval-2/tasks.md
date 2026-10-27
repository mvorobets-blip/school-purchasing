# Задачі: доповнення плану зрізу WS7

## 1. Ім'я автора для схвалювача — `task/slice2-finish` (#28)

- [x] 1.1 Міграція `20261026222326_request_author_email_fallback.sql`: ім'я, без імені — email, лише для видимих заявок.
- [x] 1.2 «Author» на сторінці заявки (таблиця ValiaBihun/2026-quitcode-dream-team#49); стовпець «Author» у «Awaiting decision».
- [x] 1.3 Тести: бази — AC-APR-08, 09, 10 (`tests/db/approval.test.ts`); сторінок — AC-APR-08, 10
  (`tests/purchase/approvals-page.test.tsx`, `tests/purchase/request-page.test.tsx`); мутація — без міграції падає AC-APR-09.
  Done when: AC-APR-08, AC-APR-09, AC-APR-10 «реалізовано» в `docs/conformance.md`; `db-deploy` застосував міграцію.

## 2. Помилки замість «нічого немає» й тести сторінок — `task/feedback-errors-tests` (#31)

- [x] 2.1 `getCurrentUser` кидає помилку бази; `src/app/(portal)/error.tsx`; пункт «Awaiting decision» лишається при
  помилці; помилка запиту автора — `Alert` замість «—».
- [x] 2.2 Тести сторінок: AC-APR-07 (причина поруч зі «Rejected»), AC-FRM-05, AC-FRM-09 (`new-purchase-page.test.tsx`),
  AC-FRM-10, AC-FRM-11 (`my-requests-page.test.tsx`); регресійні — `tests/org/current-user.test.ts`, помилки автора.
- [x] 2.3 «← Awaiting decision» на сторінці заявки, відкритій зі списку для рішення.
  Done when: AC-APR-07, AC-FRM-05, 09, 10, 11 — поведінка без змін, тести сторінок у рядках `docs/conformance.md`.

## 3. Межа ціни після округлення — `task/price-limit` (#32, issue #25)

- [x] 3.1 Міграція `20261027132703_submit_purchase_rounded_price_limit.sql`; коментар `src/lib/purchase/form.ts`.
- [x] 3.2 Тест бази: `9999999999.99` приймається; `.995`, `.996`, `.999`, `10000000000` → `INVALID_LINE`; мутація —
  без міграції падає.
  Done when: AC-FRM-15 — поведінка без змін; `db-deploy` застосував міграцію.
