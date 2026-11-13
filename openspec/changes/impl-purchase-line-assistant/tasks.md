# Tasks

Одна задача — одна гілка `task/<коротко>` і один PR «Реалізація». У кожній: тести спершу — в окремій сесії агента
(червоні до коду); незалежне рев'ю перед merge; CodeRabbit з відповіддю на кожну знахідку; рядки `docs/conformance.md`
у тому самому PR. Перевірка: `npm run lint`, `typecheck`, `npm test`, `build`, `ac:coverage`, `spec:check`,
`npx fallow audit --base origin/main`. Живого виклику моделі в CI немає.

## 1. Набір, ADR і ключ на сервері — `task/ai-kit`

- [ ] 1.1 ADR `docs/decisions/0004-ai-feature-openrouter.md` з шаблону набору; залежності з точними версіями:
  `ai@7.0.162 @openrouter/ai-sdk-provider@3.1.0 zod@4.6.7 server-only@0.0.1`; скрипти `eval`, `ai:models`, `ai:quota`.
- [ ] 1.2 Файли набору: `src/lib/ai/{models,openrouter}.ts`, `tests/ai-key.test.ts`, `evals/`, `scripts/{free-models,quota}.mjs`,
  `vitest.eval.config.mts`; `.env.example` — назва `OPENROUTER_API_KEY`.
- [ ] 1.3 `tests/fixtures/golden/cases.json` — 10 кейсів PM з #70 (`expected` — з таблиці PM, `rubric` — словами PM).
- [ ] 1.4 Перевірка: `npm test` зелений без ключа, `npm run ai:models` — моделі ланцюжка існують.
  Done when: AC-AI-05 (немає ключа → `null`, без виклику) доведено тестом обгортки; `tests/ai-key.test.ts` зелений.

## 2. Помічник у формі — `task/ai-line-assistant`

- [ ] 2.1 Схема й правила кодом (`src/lib/ai/schema.ts`, `rules.ts`): статуси, межі кількості й ціни, ін'єкція кодом.
- [ ] 2.2 Промпт `src/lib/ai/prompts/line.ts` з `<document>` і `LINE_PROMPT_VERSION`; суддя для `rubric` (eval).
- [ ] 2.3 Server Action `requestLineSuggestion`: `getCurrentUser()` до моделі, таймаут 15 с, мапінг збоїв; нічого не пише.
- [ ] 2.4 UI у `purchase-form.tsx`: поле опису, кнопка, стани й повідомлення (`src/lib/ai/messages.ts`); рядок у форму.
- [ ] 2.5 Тести: golden офлайн з AC ID (`tests/golden.test.ts`), збої (429, 429 у 200, таймаут, не за схемою, немає ключа),
  ін'єкція, «дія нічого не пише»; форма — очікування (AC-AI-03) і заповнення рядка (AC-AI-01).
  Done when: AC-AI-01, AC-AI-02, AC-AI-03, AC-AI-04, AC-AI-05, AC-AI-06 «реалізовано» в `docs/conformance.md`.

## 3. Живий eval і записи — `task/ai-eval`

- [ ] 3.1 Людина: `npm run ai:quota`, потім `RECORD=1 npm run eval` (не в добу приймання PM).
- [ ] 3.2 Звіт `evals/reports/<дата й час>.md` і `recorded.json` без заглушок; кожен FAIL — рядок пояснення.
  Done when: AC-AI-01, AC-AI-02, AC-AI-06 — golden cases на справжніх записах; звіт на SHA.

## 4. Прод і UAT — `task/ai-uat`

- [ ] 4.1 `OPENROUTER_API_KEY` у Vercel Production; функція на проді: один кейс, що проходить, одна відмова.
- [ ] 4.2 UAT на проді (конвеєр WS8): AC-AI-01 («закупівлю ще не подано» — людина підтверджує) і AC-AI-02 (відмова);
  звіт у `docs/qa/uat/<YYYY-MM-DD>/`, відео в PR.
- [ ] 4.3 «eval готовий» у чаті команди з датою живого прогону.
  Done when: AC-AI-01, AC-AI-02 — UAT на проді; `/api/health` = SHA `main`.
