# QA proof pack: зріз 2 — працівник подає закупівлю, схвалювач вирішує, інтерфейс англійською

<!--
Шаблон з koldovsky/2026-quitcode-08-quality-hw/materials/templates/proof-pack.template.md.
Покладіть у docs/qa/proof-pack.md вашого репо й заповнюйте по кроках WS8 (A → B → C → D).
Посилання — на файли на коміті (…/blob/<sha>/…#L<N>), на PR (…/pull/N) і на прогони (…/actions/runs/N).
Жодних паролів і пароля від accounts.zip. Акаунти — лише адреси *@example.test.
Цей файл — вхід для конвеєра WS9: на кожен AC видно, чим він доведений.
-->

- Прод-URL: https://therapy-scheduling-ten.vercel.app
- Вимоги: https://github.com/ValiaBihun/2026-quitcode-dream-team · джерело: issues · знімок 2026-11-02
- `/api/health` на момент UAT: <!-- sha і db, напр. «sha 1a2b3c4, db ok, 01.11.2026» -->

## 3 AC

| AC | Вид | «Тоді» (дослівно з вимоги PM) |
|---|---|---|
| AC-FRM-08 | відмова в браузері (чужі дані за прямим посиланням) | Тоді він бачить повідомлення «Недостатньо прав», даних закупівлі йому не показано, а закупівля працівника 1 лишається зі статусом «Очікує схвалення». |
| AC-FRM-14 | стан інтерфейсу (порожній стан) | Тоді він бачить повідомлення «Ви ще не подали жодної заявки», а списку заявок немає. |
| AC-FRM-15 | стан інтерфейсу (помилка) | Тоді він бачить повідомлення «Заповніть усі поля рядка», а закупівлю не подано. |

- Джерело AC: `requirements/47-pratsivnyk-podaie-zakupivliu-cherez-formu.md` (ValiaBihun/2026-quitcode-dream-team#47).
- Інтерфейс англійською (ValiaBihun/2026-quitcode-dream-team#49, таблиця текстів): на екрані «Not enough permissions», «You have not submitted any requests yet», «Fill in all line fields»; статус «Очікує схвалення» — «Awaiting approval».
- Акаунти на проді (усі `*@example.test`, паролі — лише в `accounts.zip`): працівник 1 — `pm-requester@example.test`; працівник 2 і працівник 3 — `member2@example.test` (заявник того самого відділу, що й працівник 1, без поданих заявок, не схвалювач). Усі 3 AC на проді лише читають: FRM-15 закупівлю не подає.

## A. Ворота

- PR воріт: <!-- …/pull/N -->
- Зелений `quality` на `main`: <!-- …/actions/runs/N -->
- Обов'язкові перевірки в `solo-main` з <!-- дата -->: <!-- назви jobs -->

Розбір першого повного прогону `fallow` (той самий — в описі PR воріт):

| Група знахідок | Скільки | Справжня / навмисна / хибна | Дія і причина |
|---|---|---|---|
| Unused file `src/lib/supabase/client.ts` (браузерний клієнт шаблону) | 1 | справжня | виправлено: файл видалено — його ніхто не імпортує, усі виклики Supabase серверні; рядок у `AGENTS.md` оновлено |
| Unused file `tests/manual/rls-smoke.mjs` | 1 | навмисна | npm-скрипт `rls:smoke` (`node --env-file=.env.local tests/manual/rls-smoke.mjs`): ручна перевірка RLS/GRANT після `db-deploy`; тепер fallow бачить точку входу сам, без `entry` |
| Unused export `AC_ID_GLOBAL` (`scripts/lib/spec-lib.mjs`) | 1 | справжня | виправлено: константу видалено, ніде не використовується (файл з шаблону — можливий конфлікт при cherry-pick шаблону, див. опис PR) |
| `shadcn` — «dev dependency used in production» | 1 | хибна | `ignoreDependencies` з причиною: лише `@import "shadcn/tailwind.css"` у `src/app/globals.css`, Tailwind 4 збирає його під час `next build`, під час роботи пакет не потрібен (devDependency з WS7, PR #35) |
| Duplicate exports `removeRequester`, `setApprover` (`admin/departments/[id]/actions.ts` ↔ `lib/org/roles.ts`) | 1 пара | справжня | лишено з поясненням: барелів немає, імпорт не двозначний; версії в `roles.ts` — TS-модель правила ролей, яку імпортують лише тести слайсу 1 (`tests/org/roles.test.ts`, `membership.test.ts`) — розбір у кроці 4 (тести з TS-копії SQL-правила) |
| Клони `check-design-tokens.mjs` ↔ `check-server-boundary.mjs` (`590b46e1`) | 1 група | навмисна | лишено: обидва файли — матеріали курсу WS7, тримаємо без змін для оновлень курсу |
| Клони з нашим `scripts/check-no-get-session.mjs` (PR #18, ADR 0003) ↔ `check-*.mjs` (`daf1f7c3`, `b4591355`, `aa35ac66`) | 3 групи | справжня | лишено з поясненням: наш скрипт повторює обхід файлів скриптів курсу; спільну функцію виносити — змінювати файли курсу; `audit.gate: new-only` не блокує |
| Клони в наших сторінках (`admin/departments/page.tsx` ↔ `(portal)/page.tsx`, 8 рядків; ↔ `requests/page.tsx`, 13 рядків) | 2 групи | справжня (дрібна) | лишено з поясненням: однакова розмітка таблиці й порожнього стану; спільний компонент — рефакторинг поза WS8 |
| Складність у скриптах курсу (`check-design-tokens` 3, `check-server-boundary` 2, `check-spec` 3, `create-demo-users` 1) | 9 | навмисна | лишено: файли шаблону курсу й матеріалів WS7 без наших змін |
| Складність у `src/components/ui/sidebar.tsx` (`Sidebar`, `SidebarMenuButton`) | 2 | навмисна | лишено: компонент shadcn/ui (DESIGN.md: компоненти змінюються лише в цій теці), змінено лише `aria-label`/`sr-only` |
| Складність у `src/app/api/health/route.ts` (`GET`) | 1 | навмисна | лишено: файл з `materials/d0` без змін (walkthrough називає цю знахідку) |
| Складність у нашому коді: `(portal)/page.tsx` (`Home`, `<arrow>`), `admin/departments/[id]/page.tsx` (`DepartmentPage`, 2 × `<arrow>`), `admin/departments/page.tsx` (`DepartmentsPage`, `<arrow>`), `requests/new/purchase-form.tsx` (`PurchaseForm`), `(portal)/layout.tsx` (`PortalLayout`), `admin/departments/[id]/actions.ts` (`errorCode`, `run`), `components/portal/app-sidebar.tsx` (`isActive`) і `scripts/check-no-get-session.mjs` (`walk`, `<arrow>`) | 14 | справжня | лишено з поясненням: сторінки з даними за роллю й форма; розбиття — рефакторинг поза WS8; сторінки доводять тести сторінок і e2e, а не покриття рядків; `new-only` не блокує |
| Прихована зв'язаність змін `approvals/page.tsx` ↔ `(portal)/layout.tsx` (100 %) | 1 пара | хибна | лишено: обидва файли вже імпортують спільний `src/lib/purchase/awaiting.ts` (`getAwaitingDecision`), тож залежність явна; сигнал — від великих squash-комітів |

Примітки: оцінки CRAP — з автоматично знайденого `coverage/coverage-final.json` (без нього fallow оцінює статично). Інформаційні розділи (hotspots, refactoring targets, health overrides) — не знахідки. Мертвих Server Actions fallow не знайшов (`unused-server-actions: error`). Повний вивід — `fallow-baseline.txt` (не комітимо).

Тестові правила лінтера (`@vitest/eslint-plugin`, `error`): 8 знахідок `no-restricted-syntax` (`vi.mock` власного модуля `@/lib/org/current-user`) виправлено окремим PR перед воротами (P08, https://github.com/mvorobets-blip/school-purchasing/pull/42) — справжній `getCurrentUser` через мок клієнта Supabase; з правилами WS8 `npm run lint` — 0.

Підлога покриття (`vitest.coverage.config.mts`, `FLOORED`): 14 доменних файлів, що вже тримають 90/85/90/90 — `health`, `theme`, `org/{access,current-user,departments,membership,messages,permissions,roles}`, `purchase/{dashboard,date,form,pagination,status}`. Поза підлогою: `purchase/awaiting` (гілки 73 %), `utils` (лише реекспорт `cn`, 0 рядків).

## B. Якість тестів

### Рівень для кожного AC

| AC | Де живе правило | Рівень | Чому | Тест |
|---|---|---|---|---|
| AC-…-NN | <!-- політика / функція бази / TS-модуль / сторінка --> | <!-- unit / база (PGlite) / e2e --> | … | <!-- …/blob/<sha>/tests/…#L<N> --> |

### Покриття

| Файл за AC | Рядки | Гілки | Чим доведено, якщо 0 % |
|---|---|---|---|
| <!-- src/lib/<модуль>.ts --> | … % | … % | — |
| <!-- src/app/<сторінка>/page.tsx --> | 0 % | 0 % | <!-- e2e: tests/e2e/….spec.ts --> |

### Доказ мутацією

| Мутант (файл:рядок, що змінено) | AC під загрозою | До | Тест, посилений з тексту AC | Після |
|---|---|---|---|---|
| <!-- src/lib/…/x.ts:14 `<=` → `<` --> | AC-…-NN | вижив | <!-- …/blob/<sha>/tests/…#L<N>: межа «…» з AC --> | убитий |

- Stryker: <!-- score до → після, посилання на PR з виводом -->
- SQL-мутації (`npm run mutation:sql`): <!-- таблиця з npm run mutation:sql -- --markdown (KILLED / SURVIVED / ERROR) з PR або «немає PGlite-гарнесу» -->
- Еквівалентні мутанти: <!-- який і чому (рядок міграції чи коду, що робить його еквівалентним) або «немає» -->

## C. UAT на проді

| AC | Специфікація | Тест (твердження) | Агент | Вердикт | Кадр |
|---|---|---|---|---|---|
| AC-…-NN | <!-- …/blob/<sha>/tests/e2e/….spec.ts --> | <!-- passed / failed --> | <!-- Haiku: PASS / FAIL / NEEDS-HUMAN (+ Sonnet, якщо була суперечка) --> | <!-- PASS / FAIL / NEEDS-HUMAN і правило (R1–R6) --> | <!-- …/blob/<sha>/docs/qa/uat/<дата>/frames/AC-…-then-1.png --> |

- Звіт: <!-- …/blob/<sha>/docs/qa/uat/<YYYY-MM-DD>/report.md -->
- Відео: <!-- вкладення в описі PR …/pull/N -->
- Рецензент: <!-- моделі зі звіту (claude-haiku-5-5; суперечки — claude-sonnet-5-5) і вартість прогону -->
- Негативний контроль: <!-- NC-… (npm run uat:nc): що навмисно хибне, вердикт (FAIL / NEEDS-HUMAN), …/pull/N -->
- Дані: <!-- «лише читання» або «@writes: uat-<запуск>@example.test, рядок «Прибирання» зі звіту» -->

### Приймання PM

| AC | Рішення PM | Посилання |
|---|---|---|
| AC-…-NN | <!-- ✅ / ❌ / NEEDS-HUMAN → … --> | <!-- коментар-підпис або issue «Відхилення від вимог» --> |

## D. Eval рецензента

- PR з вадами (не злитий): <!-- …/pull/N -->
- Ключ і таблиця: <!-- …/pull/N#issuecomment-M -->

| # | Вада (ключ) | CodeRabbit | `/code-review high` |
|---|---|---|---|
| 1 | <!-- категорія і файл:рядок --> | <!-- знайшов / пропустив + цитата --> | <!-- знайшов / пропустив + цитата --> |
| 2 | … | … | … |
| 3 | … | … | … |
| П | приманка: <!-- що --> | <!-- хибна тривога? цитата --> | <!-- хибна тривога? цитата --> |

- Інші знахідки: <!-- слушна / шум, по рядку на кожну -->
- Правило, що закриває пропуск: <!-- рядок в AGENTS.md чи path instruction, …/commit/<sha> -->
- Повторний прогін: <!-- хто, результат, цитата, …/pull/N#issuecomment-M -->
