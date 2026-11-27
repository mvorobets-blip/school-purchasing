#!/usr/bin/env node
// Дія 5 з postmortem docs/incidents/2026-11-23-staging-supabase-url.md: алерт у Telegram показує ПРИЧИНУ червоного
// smoke — перший рядок ::error з журналу scripts/smoke.mjs, — а не лише «червоний, дивіться прогін».
// Використання (.github/workflows/smoke.yml, крок алерту): node scripts/smoke-first-error.mjs "$RUNNER_TEMP/smoke.log"
// Друкує текст після «::error …::» (до 300 символів, в один рядок) або нічого, якщо рядка ::error немає чи файлу немає.
// Секретів журнал smoke не містить: smoke.mjs значення секрету обходу не друкує (тест tests/scripts/smoke.test.ts).
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const MAX_REASON = 300;

// Запобіжник: GitHub маскує секрети лише в журналі прогону, а файл smoke.log і текст у Telegram — ні. smoke.mjs секретів не
// друкує, але якщо колись почне — довгі ключоподібні рядки (32+ символів, не hex коміту) і значення заголовка обходу
// в Telegram не підуть.
const BYPASS_VALUE = /(x-vercel-protection-bypass\s*[:=]\s*)\S+/gi;
// Без «=» і «/»: інакше «supabaseRef=<ref>» чи адреса склеїлися б в один «довгий токен» і зникли б з причини.
const LONG_TOKEN = /[A-Za-z0-9_\-+]{32,}/g;
const HEX = /^[0-9a-f]+$/i;

/** Прибирає значення, схожі на секрети, лишаючи хеші комітів (hex) і короткі ref Supabase. */
export function redact(text) {
  return text
    .replace(BYPASS_VALUE, "$1[приховано]")
    .replace(LONG_TOKEN, (token) => (HEX.test(token) ? token : "[приховано]"));
}

/** Текст першого рядка ::error (без «::error title=…::»), в один рядок і до MAX_REASON символів; немає — null. */
export function firstError(log) {
  for (const line of String(log ?? "").split(/\r?\n/)) {
    if (!line.startsWith("::error")) continue;
    // Роздільник — перші «::» після «::error»: у title smoke стоїть адреса (https://…), а «://» — не «::».
    const at = line.indexOf("::", "::error".length);
    const text = redact((at === -1 ? "" : line.slice(at + 2)).replace(/\s+/g, " ").trim());
    if (!text) continue;
    return text.length > MAX_REASON ? `${text.slice(0, MAX_REASON - 1)}…` : text;
  }
  return null;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let log = "";
  try {
    log = readFileSync(process.argv[2] ?? "", "utf8");
  } catch {
    // Немає журналу (smoke не дійшов до запуску) — алерт скаже «див. прогін».
  }
  const reason = firstError(log);
  if (reason) process.stdout.write(reason);
}
