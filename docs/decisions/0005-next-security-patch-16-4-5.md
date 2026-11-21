# 0005. Next.js 16.4.3 → 16.4.5 — патч безпеки в межах 16.4 (через Dependabot)

- Статус: прийнято
- Дата: 2026-11-21
- AC: — (поведінка застосунку не змінюється; стосується всіх сторінок і дій)

## Контекст

`AGENTS.md`: «Стек і версії (не оновлювати без ADR)» — Next.js 16.4. 21.11 `npm audit` і сама збірка Next.js
(«SecurityFatalError: Your version of Next.js is affected by a known security vulnerability») показали 6 вразливостей
середнього рівня для `next` 16.0.0–16.4.4 (у нас 16.4.3), виправлених у 16.4.5:

| Advisory | Що | Чи стосується нас |
|---|---|---|
| GHSA-mfr8-8qww-v76h, GHSA-vc7v-qv4w-wrv8, GHSA-rhh4-g77r-r9qj | витік даних через `use cache` / `unstable_cache` | ні: Cache Components вимкнено (`AGENTS.md`), `use cache` не використовуємо |
| GHSA-7qx7-33qx-rqx2 | обхід відхилення SVG в оптимізації зображень | ні: `next/image` з зовнішніми SVG не використовуємо |
| GHSA-f3mh-rxg3-f5g2 | HttpOnly-cookie в заголовку на маршрутах Edge runtime | частково: Proxy (`src/proxy.ts`) оновлює сесію Supabase в cookie |
| GHSA-pc58-hwjq-p385 | ін'єкція відповіді в самостійно розгорнутих застосунках | ні: Vercel |

Прямого вектора атаки майже немає, але сесійні cookie і вимога курсу «`next` без відомих вразливостей» — достатня
причина оновитися одразу. WS11 (трек D) просить оновлювати залежності через Dependabot з паузою (`cooldown` у
`.github/dependabot.yml`, `min-release-age=7` у `.npmrc`), а не вручну.

## Рішення

`next` — **16.4.5** (точна версія, як і раніше) з PR Dependabot (security update): мінімальна версія з виправленнями.
`npm audit --omit=dev` після оновлення — 0 вразливостей. Мінорна лінія та сама (16.4), тож `AGENTS.md` не змінюється;
сторінки, Proxy й Server Actions — без змін коду. `eslint-config-next` лишається 16.4.3 до групового PR Dependabot
(«npm-minor-and-patch»): це лише правила лінтера, на збірку й роботу застосунку не впливає.

## Розглянуті варіанти

- 16.4.6 власним PR (#87, підготовлений як запасний варіант) — ні: оновлюємо через Dependabot, щоб діяли пауза й
  перевірки ланцюга постачання; #87 закриваємо як «замінено #96» одразу після merge цього PR.
- Лишитися на 16.4.3, бо вектори майже не стосуються нас, — ні: збірка Next.js уже зупиняється з `SecurityFatalError`
  (повторний запуск проходить), а наступне advisory може стосуватися саме нас.
- Наступна мінорна лінія — ні: без потреби й без ADR на зміни API.

## Наслідки

- Перевірка: CI PR (`spec`, `app`, `conformance`, `db-check`, e2e, `quality`), Vercel preview; після merge — `smoke`
  і `/api/health` на проді (sha = коміт merge).
- Наступне оновлення `next` — так само PR Dependabot + ADR (або доповнення до цього) і перевірка `npm audit`.
- Мажорні оновлення TypeScript 7, ESLint 10, `@types/node` 26 Dependabot запропонував 21.11 — закрито з
  `@dependabot ignore this major version` (#92–#94): поза стеком `AGENTS.md`, потребують окремого ADR.
