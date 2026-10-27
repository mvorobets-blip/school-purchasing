# Дизайн: доповнення плану зрізу WS7

## Context

Основа — план `openspec/changes/archive/2026-10-26-impl-purchase-approval/` і ADR 0002, 0003. Нового в моделі даних
немає: дві нові міграції лише замінюють тіла наявних функцій (`create or replace`), застосовані міграції не змінено.

## Goals / Non-Goals

**Goals:** AC-APR-08 … 10; помилки бази видно на сторінці; та сама межа ціни на сторінці й у базі; тести сторінок,
яких бракувало за відгуком.

**Non-Goals:** межі значень PM (ціла кількість від 1, ціна від 0) — наступний зріз (вимога 47,
ValiaBihun/2026-quitcode-dream-team#60); пагінація списків і обмеження довжини тексту — наступний зріз.

## UI і компоненти

| Сторінка | Що змінено | AC |
|---|---|---|
| `/approvals` «Awaiting decision» | стовпець «Author» — ім'я автора, без імені — email; рядок веде на `/requests/<id>?from=approvals` | APR-08, 09, 10 |
| `/requests/[id]` | поле «Author» (було «Submitted by»; підпис — таблиця ValiaBihun/2026-quitcode-dream-team#49); зі списку для рішення — `BackLink` «← Awaiting decision», інакше «← My requests» | APR-08, 09, 10 |
| Портал | `src/app/(portal)/error.tsx` — `Alert` «Could not load the page. Refresh the page.» і `outline` «Try again» (`retry()`); помилка запиту автора — `Alert` «Could not load …» замість «—» | — |
| Бічна панель | пункт «Awaiting decision» не зникає, якщо запит списку впав | — |

## Дані й RLS

- `supabase/migrations/20261026222326_request_author_email_fallback.sql` (задача 1): `private.request_author_names`
  віддає `coalesce(nullif(btrim(full_name), ''), email)` — ті самі умови видимості (автор, схвалювач відділу заявки,
  адміністратор), одне поле про автора (APR-09, 10).
- `supabase/migrations/20261027132703_submit_purchase_rounded_price_limit.sql` (задача 3): `private.submit_purchase`
  перевіряє `round(v_price, 2) >= 10000000000` → `INVALID_LINE` (замість `22003` на `insert`); та сама межа, що
  `PRICE_LIMIT` у `src/lib/purchase/form.ts`.

## Auth

- `getCurrentUser()`: помилка запиту профілю кидається (сторінку замінює `error.tsx`), а не повертає `null` — інакше
  людину перенаправляло б на вхід, ніби вона гість. Гість і деактивований (RLS не віддає профіль) — `null`, як і раніше
  (ADR 0003 без змін).

## Risks / Trade-offs

- `error.tsx` замінює всю сторінку порталу при помилці профілю — менш точно, ніж повідомлення в місці, але не вводить в
  оману («ви не увійшли»).
