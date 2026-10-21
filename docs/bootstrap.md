# Чекліст розробника, день 0

<!--
Заповнюєте ви одразу після заняття, у цьому порядку: власне репо, власні Supabase і Vercel, перший зелений CI, ruleset.
Мета — застосунок працює локально й на вашому прод-URL, міграції в базу застосовує лише CI, а в main усе йде через PR.
Для кожного пункту — доказ: посилання (run CI, PR, preview), назва змінної або знімок екрана в docs/img/
(без справжніх назв клієнта й людей: зображення spec:check не перевіряє).
ЗНАЧЕННЯ СЕКРЕТІВ І ПАРОЛІВ НІКОЛИ НЕ ПИШІТЬ — лише назви змінних і де вони задані.
Заповнений файл (розділи 1–6) — ваш перший PR, тип «Реалізація» (розділ 7): він же перевіряє ruleset. Посилання на сам
цей PR і на preview допишіть наступним PR. Пояснення кроків — README, «Шлях розробника».
Docker не потрібен: локально — лише npm run dev проти вашої бази; міграції на одноразовій базі перевіряє CI (db-check).
-->

Моє репо: https://github.com/mvorobets-blip/school-purchasing (перейменовано з `therapy-scheduling`, старі посилання переадресовуються) · Прод-URL: https://therapy-scheduling-ten.vercel.app
Репо вимог PM: https://github.com/ValiaBihun/2026-quitcode-dream-team · Організація Supabase: `school-purchasing` (Free)

## 1. Інструменти й репо

- [x] Node 24 (`node -v`), Git, GitHub CLI (`gh auth status`); OpenSpec CLI глобально тієї ж версії, що в `package.json`:
      `npm i -g @fission-ai/openspec@1.14.1` → `openspec --version` = `1.14.1` — Node v24.21.0, gh 2.100.0,
      `openspec --version` = 1.14.1, телеметрію вимкнено (`openspec config set telemetry.enabled false`)
- [x] Репо створено з шаблону (**Use this template → Create a new repository**): власник — ваш особистий акаунт, назва —
      `<team-slug>`, **Public** (ruleset на GitHub Free діє лише в публічних репо; PM у нотатці-порівнянні посилається на
      рядки вашого коду) — https://github.com/mvorobets-blip/school-purchasing (Public, з
      `koldovsky/2026-quitcode-06-project-template`)
- [x] `git clone https://github.com/<dev>/<team-slug>.git` → `npm ci` → `cp .env.example .env.local`
      (у PowerShell: `Copy-Item .env.example .env.local`)
- [x] CodeRabbit (GitHub App) встановлено на це репо (github.com/apps/coderabbitai → Configure → Only select repositories) — `docs/img/coderabbit.png`
- [ ] (Якщо PM надіслав список справжніх назв клієнта особистим повідомленням) — локальний `product/denylist.local.txt`
      (у `.gitignore`; `npm run spec:check` читає його й значень не друкує)

## 2. Supabase: власна база

- [x] Організацію й проєкт створено у вашому акаунті (один із двох безкоштовних проєктів; регіон — найближчий) —
      організація й проєкт `school-purchasing` (перейменовано з `therapy-scheduling`), регіон `eu-west-1` (West EU, Ireland)
- [x] Authentication: «Allow new users to sign up» **вимкнено**, «Confirm email» **вимкнено**
      (точні назви й місце перемикачів перевірте в інтерфейсі) — `docs/img/auth-signups-email.png` (обидва перемикачі на одному знімку)
- [x] (Після розділу 4, коли є прод-URL) Authentication → URL Configuration: Site URL = прод-URL Vercel; Redirect URLs
      `http://localhost:3000/**`, `https://*-<slug>.vercel.app/**` — Site URL `https://therapy-scheduling-ten.vercel.app`;
      Redirect URLs `http://localhost:3000/**`, `https://*-mvorobets-blip.vercel.app/**` — `docs/img/auth-urls.png`
- [x] `.env.local`: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`
      (Project Settings → API Keys; точну назву розділу перевірте в інтерфейсі) і `DEMO_USER_PASSWORD` (≥ 8 символів).
      Значення не комітимо й не вставляємо в чат — задано всі чотири змінні; `.env.local` git ігнорує (`!! .env.local`)

## 3. GitHub: environment `production` і секрети

- [x] Settings → Environments → `production` (якщо перший прогін CI вже створив його автоматично — відкрийте наявний;
      `Production`, яке створює Vercel для своїх деплоїв, — те саме середовище: регістр у назвах GitHub не розрізняє):
      **Deployment branches** = Selected branches → `main` — середовище створив перший прогін CI; `docs/img/production-environment.png`
- [x] Секрет environment `SUPABASE_DB_URL` = рядок **Session pooler** (порт **5432**, не 6543) з Supabase → **Connect**;
      пароль у рядку percent-encoded — `SUPABASE_DB_URL` (секрет environment `production`, не репозиторію); пароль лише з
      літер і цифр, кодування не потрібне
- [x] Запасний шлях (лише якщо `--db-url` не працює): секрети environment `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`,
      `SUPABASE_PROJECT_ID` (README, «Міграції в прод: запасний шлях») — не потрібно: `db-deploy` працює через `SUPABASE_DB_URL`
- [ ] (Необов'язково) секрет репо `SPEC_DENYLIST` — ті самі справжні назви через кому, для CI

## 4. Vercel

- [x] Add New → Project → імпорт вашого репо, Node 24.x — https://therapy-scheduling-ten.vercel.app (Node 24.x з `engines`
      у `package.json`); `docs/img/vercel-prod-deployment.png`
- [x] Змінні Production і Preview — лише `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`;
      `SUPABASE_SECRET_KEY` — **ніколи** — `docs/img/vercel-env-vars.png`
- [x] Settings → Deployment Protection → **Require Log In** вимкнено → Save (інакше PM і викладач не відкриють ваші preview;
      точну назву перемикача перевірте в інтерфейсі) — `docs/img/vercel-require-login.png`
- [x] Після змінних — редеплой; прод-URL відкривається — https://therapy-scheduling-ten.vercel.app/login

## 5. База й перший зелений CI

- [x] Actions → CI → **Run workflow** (гілка `main`, `include_seed` ✓) → job `db-deploy` застосував першу міграцію й сид —
      https://github.com/mvorobets-blip/school-purchasing/actions/runs/39257186959/job/118076369134
      (`20261012000000_profiles_and_roles.sql` і `seed.sql`)
- [x] `npm run users:demo` (синтетичні користувачі з `supabase/demo-users.json`) → `npm run dev` → `http://localhost:3000` →
      вхід як `admin@example.test` працює локально й на прод-URL — створено `admin@example.test` (admin),
      `member1@example.test`, `member2@example.test` (member); вхід на проді — `docs/img/prod-login.png`
- [x] CI на `main` зелений: `spec`, `app`, `conformance`, `db-check`, `db-deploy` —
      https://github.com/mvorobets-blip/school-purchasing/actions/runs/39257186959

## 6. Ruleset `solo-main` (лише після зеленого CI на `main`)

- [x] Settings → Rules → Rulesets → **New ruleset → Import a ruleset** → `solo-main.json` з курсового репо
      (`materials/rulesets/solo-main.json`) або вручну: target — гілка за замовчуванням (`main`); Restrict deletions;
      Block force pushes; Require a pull request — **0 approvals** (колег у вашому репо немає); Require status checks
      (джерело GitHub Actions, без «up to date»): `spec`, `app`, `conformance`, `db-check`; Allowed merge methods —
      **Squash** і **Merge**; Bypass list — **порожній** (навіть для власника); Enforcement — Active
      (точні назви полів перевірте в інтерфейсі) — створено через `gh api` з `solo-main.json`:
      https://github.com/mvorobets-blip/school-purchasing/rules/25407855 (`current_user_can_bypass: never`) — `docs/img/ruleset.png`

## 7. Перший PR (перевірка ruleset-у)

- [x] `git switch -c setup/bootstrap` → цей файл із доказами розділів 1–6 → push → `gh pr create --web` (тип «Реалізація»)
      → окремим коментарем `@coderabbitai review` — https://github.com/mvorobets-blip/school-purchasing/pull/1
- [x] Поки перевірки не зелені, кнопка merge заблокована; push у `main` напряму відхиляється — `docs/img/merge-blocked.png`
      (знімок з PR «Специфікація» #4, поки чотири обов'язкові перевірки ще виконувались); прямий push у `main` блокує
      ruleset `solo-main` (`current_user_can_bypass: never`)
- [x] Vercel створив preview для PR — https://therapy-scheduling-git-setup-bootstrap-mvorobets-blip.vercel.app (з коментаря Vercel у PR #1;
      `/login` відкривається без входу у Vercel)
- [x] **Squash and merge** → прод-деплой Vercel пройшов — PR #1 злито (`8e26a92`); CI на `main`:
      https://github.com/mvorobets-blip/school-purchasing/actions/runs/39271713923, статус Vercel на `8e26a92` — success
- [ ] (З першою задачею, що має міграцію) `db-check` зелений, після merge `db-deploy` застосував її у вашу базу — задача 1.1
      (міграція `20261021213618_department_setup.sql`); посилання на run — наступним PR

## 8. Вимоги PM і специфікація

- [x] Адресу репо вимог PM узято з чату команди; на зустрічі команди (дні 0–2, до кінця 15.10, організує PM; якщо
      команда не зібралася — діра в чат команди до обіду 16.10) — перший раунд питань до брифу —
      https://github.com/ValiaBihun/2026-quitcode-dream-team
- [x] PM написав у чаті команди «вимоги оновлено» (у курсі перші вимоги — до кінця 16.10) → у Claude Code чи Cursor
      `/requirements-sync <pm>/<team-slug>-spec` → PR «Оновлення вимог» злито; шапка `docs/conformance.md` показує
      адресу, джерело (issues чи docs) і дату знімка — PR «Оновлення вимог» #2, #3, #6, #7 (#5 закрито: знімок застарів до
      merge); шапка — `знімок 2026-10-21`
- [x] Читання вимог: скіл `spec-clarify` → питання — issues «Питання до вимог» у репо PM через вебформу → журнал
      `docs/spec-reading.md` — ValiaBihun/2026-quitcode-dream-team#35, ValiaBihun/2026-quitcode-dream-team#36,
      ValiaBihun/2026-quitcode-dream-team#37, ValiaBihun/2026-quitcode-dream-team#38, ValiaBihun/2026-quitcode-dream-team#41
      (усі власні; PM відповів на всі)
- [x] Переклад у специфікацію (гілка `spec/add-<зріз>`): `/opsx:propose add-<зріз>` → `npx openspec validate add-<зріз> --strict`
      → скіл `spec-review` → `npx openspec archive add-<зріз> -y` → `/conformance` → PR «Специфікація» злито;
      `npm run ac:coverage` без «вимогу PM ще не перекладено» — PR «Специфікація» #4 (`add-department-setup`, 31 AC),
      #8 (`clarify-department-setup`, AC-ORG-34), план #9 (`impl-department-setup`)
