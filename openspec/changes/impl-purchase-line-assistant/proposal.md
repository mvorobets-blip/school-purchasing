# Пропозиція: план реалізації зрізу 4 (WS10) — помічник AI пропонує рядок закупівлі

## Why

Реалізуємо зріз 4 за специфікацією `openspec/specs/purchase-line-assistant/spec.md` (зміна
`add-purchase-line-assistant`, знімок вимог PM 2026-11-13 — шапка `docs/conformance.md`). Специфікацію не змінюємо
(`skip_specs: true`): ця зміна — лише план.

## What Changes

Покриває 6 AC зрізу 4 (`purchase-line-assistant`): AC-AI-01, AC-AI-02, AC-AI-03, AC-AI-04, AC-AI-05, AC-AI-06.

Golden cases PM (ValiaBihun/2026-quitcode-dream-team#70; 10 кейсів WS10: № 1, 5, 6, 7, 8, 9, 11, 12, 13, 14) — офлайн
у CI з записами живого прогону і один звіт живого прогону `npm run eval`. Поза AC, але з правил кейсів (регресійні тести
без AC ID): кількість — ціле від 1, ціна — від 0 (кейси № 5–7); чужі дані — відмова (№ 9); спроба дістати пароль —
ін'єкція (№ 12).
