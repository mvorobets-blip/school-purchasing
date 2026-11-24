# Postmortem: тестова версія (staging) ~21 хвилину не бачила своєї бази даних

**Blameless (без пошуку винних)** — шукаємо, *що в системі* дозволило помилці статися і дійти до людей, а не
*хто* винен. Людина помиляється завжди; добра система ловить помилку раніше за користувача.

| | |
|---|---|
| Дата інциденту | 2026-11-23 |
| Автори | черговий розробник; рецензія — PM |
| Статус | розбір PM 23.11 ([коментар у #107](https://github.com/mvorobets-blip/school-purchasing/pull/107#issuecomment-7107635893)); зауваження виправлено 24.11, чекає підпису PM |
| Серйозність | **SEV3** — тестова версія без користувачів (матриця PM: ValiaBihun/2026-quitcode-dream-team#83, розділ 2). Така сама поломка на проді — **SEV1**: без бази не працює вхід ні в кого |
| Середовище | `staging` (навчальний дріл, issue [#105](https://github.com/mvorobets-blip/school-purchasing/issues/105)); прод і база проду не постраждали |
| Стенограма розбору агентом | [`docs/incidents/2026-11-23-staging-supabase-url-rca.md`](2026-11-23-staging-supabase-url-rca.md) |

Час у документі — **UTC** (Київ = UTC+2).

## Підсумок

У налаштуваннях Vercel для гілки `staging` адресу бази (`NEXT_PUBLIC_SUPABASE_URL`) навмисно змінили на один символ
(дріл, варіант A гайду інциденту). Після Redeploy staging звертався до неіснуючого проєкту Supabase ~21 хв. Smoke
деплою почервонів за ~17 с після того, як деплой став готовим, і надіслав алерт у Telegram; агент у профілі «лише
пропонує» знайшов причину (сам аналіз — ~1,5 хв; уся сесія розбору разом із запуском і перевіркою профілю — ~5 хв); людина видалила хибне перевизначення й зробила Redeploy — smoke зелений.

## Вплив (мовою користувача)

- **Тестова версія:** з 16:01 до 16:22 застосунок не міг дістатися до своєї бази. Сторінка входу відкривалась, але
  увійти й працювати із заявками не вдалося б. Самого входу під час дрілу не пробували — це висновок із відповіді
  системи.

  Доказ: `/api/health` → 503, `db: down`; `src/lib/supabase/proxy.ts` звертається до Supabase лише з cookie сесії,
  тому сторінка входу без сесії відкривається, а вхід — ні.
- **Кого зачепило:** нікого. PM пройшла сценарій приймання на staging до дрілу (#103) і була попереджена не тестувати
  staging під час дрілу (коментар у #103 о 15:31); інших користувачів у staging немає.
- **Чого не зачепило:** прод працював без змін — прод-smoke зелений о 16:01:44 і 16:08:28 з базою проду
  (`supabaseRef` `tqbv…`, `db: ok`; прогони [45211776064](https://github.com/mvorobets-blip/school-purchasing/actions/runs/45211776064),
  [45213076210](https://github.com/mvorobets-blip/school-purchasing/actions/runs/45213076210)). Дані не втрачено й не
  змінено: міграцій не було, а база staging запитів не отримувала зовсім (хибна адреса не існує).

## Хронологія

| Час (UTC) | Подія | Доказ |
|---|---|---|
| 15:31 | Issue дрілу з передбаченим сигналом (записано до поломки); PM попереджено | [#105](https://github.com/mvorobets-blip/school-purchasing/issues/105), [коментар у #103](https://github.com/mvorobets-blip/school-purchasing/issues/103#issuecomment-7105689634) |
| 15:47:04 | Норма: smoke `deploy` staging зелений (`supabaseRef` `rnawhejsgqhgbtjajjmb`, `db: ok`) | [45209055366](https://github.com/mvorobets-blip/school-purchasing/actions/runs/45209055366) |
| ~16:00 | **Зміна, яка зламала:** нове перевизначення `NEXT_PUBLIC_SUPABASE_URL` лише для Preview → гілка `staging`, один символ ref змінено (`…jjmb` → `…jjmc`); Redeploy без кешу (`dpl_FjpPQFUKg…`, 16:00:34) | стенограма, `list_deployments`; точного часу збереження змінної немає |
| ~16:01:30 | Деплой staging готовий (`school-purchasing-8ggplxxaz-…`, коміт `9bc4249`) — **T0** | подія `vercel.deployment.success` → прогін о 16:01:35 |
| 16:01:50 | **Сигнал:** smoke `deploy` червоний — `/api/health` 503, `db: down`, `reason: status-0`, `supabaseRef: rnawhejsgqhgbtjajjmc` | [45211781650](https://github.com/mvorobets-blip/school-purchasing/actions/runs/45211781650) |
| 16:01:50 | **Алерт** «ЧЕРВОНИЙ SMOKE» у Telegram (у групі — 18:01 за Києвом) — **T1** | рядок «Алерт надіслано в Telegram.» у прогоні; [знімок](../ops/ws11-drill-alert.png) |
| 16:08–16:13 | Розбір агентом у профілі `.claude/settings.incident.json` (режим `plan`): причина — хибний `NEXT_PUBLIC_SUPABASE_URL` для `staging`, впевненість висока | [стенограма](2026-11-23-staging-supabase-url-rca.md) |
| ~16:20 | Людина видалила **лише** перевизначення гілки `staging`; Redeploy без кешу | коментар у [#105](https://github.com/mvorobets-blip/school-purchasing/issues/105#issuecomment-7107047135); точного часу видалення немає |
| 16:22:30 | Smoke `deploy` зелений (`supabaseRef` `rnawhejsgqhgbtjajjmb`, `db: ok`) — інцидент закрито — **T2** | [45215733895](https://github.com/mvorobets-blip/school-purchasing/actions/runs/45215733895) |

## Виявлення

- **Сигнал:** червоний smoke, job `deploy` (подія Vercel `vercel.deployment.success` → `repository_dispatch`), крок
  `if: failure()` надіслав повідомлення в Telegram-групу команди.
- **Час до виявлення:** від готового деплою (~16:01:30) до алерту (16:01:50) — **~17–20 с** (передбачали «до 5 хв»).
- **Час до відновлення:** від алерту (16:01:50) до зеленого smoke (16:22:30) — **~21 хв**, з них розбір агентом
  ~5 хв; решта — очікування людини й Redeploy.
- **Без сигналу:** сторінка входу відкривалась (`/` → 307, `/login` → 200), тож очима збій помітили б лише при спробі
  увійти — тобто від PM на наступному UAT.

## Першопричина

| Твердження | Доказ |
|---|---|
| Деплой staging працював з адресою Supabase `…jjmc` замість `…jjmb` | `/api/health` у прогоні [45211781650](https://github.com/mvorobets-blip/school-purchasing/actions/runs/45211781650): `"supabaseRef":"rnawhejsgqhgbtjajjmc"`; норма — `rnawhejsgqhgbtjajjmb` у [45209055366](https://github.com/mvorobets-blip/school-purchasing/actions/runs/45209055366) |
| `supabaseRef` береться саме з `NEXT_PUBLIC_SUPABASE_URL` | `src/app/api/health/route.ts:18` → `supabaseRefFrom` у `src/lib/health.ts` (коміт `9bc4249`) |
| Код не змінювався: зелений і червоний деплой — той самий коміт | `"sha":"9bc4249…"` в обох прогонах |
| `status-0` — відповіді від хоста не було взагалі (адреса не існує), а не помилка ключа чи пауза | `classifyDbProbe` у `src/lib/health.ts`: `paused` — лише HTTP 540, `invalid-api-key` — лише текст «api key» |
| Змінна `NEXT_PUBLIC_` вбудовується під час збірки, тому зламав Redeploy, а не саме збереження змінної | документація Next.js «[Bundling Environment Variables for the Browser](https://nextjs.org/docs/app/guides/environment-variables#bundling-environment-variables-for-the-browser)» (та сама сторінка — у `node_modules/next/dist/docs/01-app/02-guides/environment-variables.md` версії 16.4.5); червоний smoke — саме на новому деплої `8ggplxxaz`, а зламаний деплой лишається зламаним і після видалення змінної (перевірено 23.11, [коментар у #105](https://github.com/mvorobets-blip/school-purchasing/issues/105#issuecomment-7125089227)) |

**Тригер:** нове перевизначення змінної лише для гілки `staging` з одним хибним символом + Redeploy. Системна
причина — значення змінної Vercel ніщо не звіряло з очікуваною базою середовища: smoke бачив лише «база недоступна»
і давав загальну підказку «Supabase недоступний чи NEXT_PUBLIC_SUPABASE_URL у Vercel не той?».

## Що НЕ було причиною

| Гіпотеза | Як перевірили | Чому відкинули |
|---|---|---|
| Поганий коміт у коді | SHA зеленого (15:47) і червоного (16:01) деплою | обидва `9bc4249` — різниці в коді немає |
| База staging на паузі чи збій Supabase | `reason` у `/api/health` | `status-0`, не `paused` (HTTP 540): запит ішов на інший ref (`…jjmc`), до проєкту staging не дійшов |
| Хибний ключ `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `reason` у `/api/health` | не `invalid-api-key`: до перевірки ключа справа не дійшла |
| Захист Vercel чи секрет обходу smoke | рядок smoke о 16:01:50 | `bypass:true`, `/` → 307, `/login` → 200 — сторінки відкрились |
| Збій Vercel у регіоні `iad1` | прод-smoke на тому самому проєкті | зелений о 16:01:44 і 16:08:28 |
| Міграції чи база проду | — | міграцій не було; прод показує `db: ok` для `tqbv…` |

Статус-сторінки провайдерів (крок 0 R09, необов'язково) не перевіряли — «невідомо»; непрямий доказ проти провайдера —
зелений прод на тому самому проєкті Vercel.

## Усунення

- **Зупинили шкоду:** видалили **лише** перевизначення `NEXT_PUBLIC_SUPABASE_URL` для Preview → `staging` (загальне
  значення Preview, `APP_ENV` і ключ не чіпали) → staging знову бере загальне значення Preview (база staging) →
  Redeploy без кешу. Instant Rollback для staging не працює (лише прод-деплої).
- **Виправили причину (щоб наступного разу збій називав себе):** PR [#106](https://github.com/mvorobets-blip/school-purchasing/pull/106)
  (злито 24.11, `fcfa3f6`) — smoke звіряє `supabaseRef` з очікуваним ref середовища; у CI: зламаний деплой дрілу —
  червоний з назвою змінної ([45349576560](https://github.com/mvorobets-blip/school-purchasing/actions/runs/45349576560)), staging — зелений ([45349590267](https://github.com/mvorobets-blip/school-purchasing/actions/runs/45349590267)).

## Що спрацювало, що ні, де пощастило

- **Спрацювало:**
  - алерт дійшов за ~17–20 с, з посиланням на прогін, середовищем і гілкою; передбачений сигнал збігся дослівно;
  - `supabaseRef` у `/api/health` (додано в WS11) одразу показав хибний ref — без доступу до змінних Vercel;
  - агент у профілі «лише пропонує» знайшов причину (аналіз ~1,5 хв, сесія ~5 хв) і запропонував виправлення; спроба Write заблокована
    профілем (`No such tool available: Write`), значення ключа агент не показав.
- **Не спрацювало:**
  - рядок smoke не казав, *яка* база очікувалась — лише загальне «недоступний чи не той?»;
  - журнали Vercel цього деплою порожні: `/api/health` не пише в журнал причину `db: down` — розбір тримався лише на
    відповіді health у журналі smoke;
  - алерт у Telegram не містить рядка помилки — щоб побачити причину, треба відкрити прогін;
  - правильний ref staging агент узяв з чернетки `docs/runbook.md`, якої ще не було в `main`;
  - до дрілу (норма) знайшли, що `APP_ENV=staging` стояв на всіх Preview, а не лише на гілці `staging` — виправлено
    перед поломкою (коментар у [#105](https://github.com/mvorobets-blip/school-purchasing/issues/105#issuecomment-7106114706)).
- **Пощастило:** це staging і дріл; PM закінчила приймання до поломки; хибний ref не належав жодному справжньому
  проєкту. Якби staging дивився в **прод-базу**, `db` був би `ok` і старий smoke лишився б зеленим — саме цей випадок
  тепер ловить дія 1.

## Дії

Власник — логін GitHub того, хто відповідає за дію (роль — у дужках).

| Дія | Власник | Строк | Перевірка, якою вона стала | Посилання |
|---|---|---|---|---|
| 1. Smoke звіряє `supabaseRef` з очікуваним ref середовища (`SUPABASE_PROD_REF` / `SUPABASE_STAGING_REF`) і називає змінну `NEXT_PUBLIC_SUPABASE_URL` | @mvorobets-blip (розробник) | 23.11.2026 | тест `tests/scripts/smoke.test.ts` «стан дрілу 23.11…» (червоний до зміни, зелений після) + `SMOKE_EXPECT_SUPABASE_REF` у `smoke.yml` | PR [#106](https://github.com/mvorobets-blip/school-purchasing/pull/106) (злито 24.11); прогони з `main`: червоний [45349576560](https://github.com/mvorobets-blip/school-purchasing/actions/runs/45349576560), зелений [45349590267](https://github.com/mvorobets-blip/school-purchasing/actions/runs/45349590267) |
| 2. Runbook: «червоний smoke» з рядком про `supabaseRef`, база на паузі, ротація ключа, журнали, доступ PM до staging | @mvorobets-blip (розробник) | 23.11.2026 | ручний прогін розділу 1 з відтворенням дрілу: команди runbook на зламаному деплої дрілу (червоний з рядком таблиці) і на поточному staging (зелений) — [результат у #105](https://github.com/mvorobets-blip/school-purchasing/issues/105#issuecomment-7125089227) | `docs/runbook.md`, PR [#107](https://github.com/mvorobets-blip/school-purchasing/pull/107) |
| 3. `APP_ENV` — лише для гілки `staging` | @mvorobets-blip (розробник) | 23.11.2026 (зроблено) | smoke preview з PR показує `"appEnv":null`, staging — `"staging"` | [#105](https://github.com/mvorobets-blip/school-purchasing/issues/105#issuecomment-7106114706), preview PR #107 — [45217536189](https://github.com/mvorobets-blip/school-purchasing/actions/runs/45217536189) |
| 4. `/api/health` пише в журнал один рядок `health.db_down` з `reason` і `supabaseRef` (без значень змінних), щоб журнали Vercel не були порожні | @mvorobets-blip (розробник) | 30.11.2026 | тест на рядок журналу | наступний PR після релізу |
| 5. Алерт у Telegram містить перший рядок `::error` smoke | @mvorobets-blip (розробник) | 30.11.2026 | ручний червоний прогін (`url` = `https://example.invalid`) і знімок повідомлення | наступний PR після релізу |
| 6. Повідомлення клієнту про SEV1/SEV2 на проді — протягом 2 годин за шаблоном PM | @ValiaBihun (PM) | постійно | runbook, розділ «Хто говорить з клієнтом» | ValiaBihun/2026-quitcode-dream-team#83 (розділ 4) |

## Факти для повідомлення клієнту (для PM)

Для цього дрілу (SEV3, staging) клієнту не пишемо — #83, розділ 4. Якщо PM складає навчальне повідомлення за
шаблоном PM [`docs/incident-message.md`](https://github.com/ValiaBihun/2026-quitcode-dream-team/blob/main/docs/incident-message.md), факти такі:

- 23.11.2026, ~21 хвилину тестова версія порталу не могла дістатися до своєї бази: сторінка входу відкривалась, але
  вхід і робота із заявками не спрацювали б (висновок із відповіді системи; вхід не пробували).
- Користувачів не зачепило: це була репетиція аварії на тестовій версії; робоча версія працювала; дані не втрачено
  й не змінено.
- Автоматична перевірка помітила збій приблизно за 20 секунд і повідомила команду в робочий чат.
- Причина — помилка в одному символі адреси бази в налаштуванні лише тестової версії; налаштування повернуто, версія
  знову працює.
- Перевірку доповнено: тепер вона порівнює адресу бази з очікуваною і називає налаштування з помилкою (перевірено
  24.11 на копії зламаної тестової версії — перевірка червона й називає налаштування).
- Така сама поломка на робочій версії — SEV1, PM повідомляє клієнта протягом 2 годин.

## Додатки

- Рядок помилки smoke (16:01:50):
  `##[error]"/api/health": HTTP 503, db=down (status-0) — Supabase недоступний чи NEXT_PUBLIC_SUPABASE_URL у Vercel не той?`
- Відповідь `/api/health` (з журналу smoke):
  `{"ok":false,"sha":"9bc4249…","env":"preview","appEnv":"staging","supabaseRef":"rnawhejsgqhgbtjajjmc","db":"down","reason":"status-0","status":503}`
- Знімок алерту без токена й chat id: [`docs/ops/ws11-drill-alert.png`](../ops/ws11-drill-alert.png).
