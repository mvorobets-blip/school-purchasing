import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PRODUCT_MODELS, makeProductModel } from "@/lib/ai/models";
import { LINE_PROMPT_VERSION } from "@/lib/ai/prompts/line";
import { passRate, scoreCase, type GoldenCase } from "@/lib/ai/scorer";
import { proposeLine, type SuggestResult } from "@/lib/ai/suggest";
import casesJson from "../tests/fixtures/golden/cases.json";

// `npm run eval` — ЖИВИЙ прогін golden cases PM (ValiaBihun/2026-quitcode-dream-team#70) на безкоштовних моделях
// OpenRouter. Ніколи не в `npm test` і не в CI. Потрібен ключ у .env.local (OPENROUTER_API_KEY); без ключа кейси
// пропускаються. Основа — evals/golden.live.eval.ts набору курсу; різниця: назву й мету PM перевіряє правилом
// «містить» код (src/lib/ai/scorer.ts), тож судді-моделі немає — прогін витрачає до 10 запитів, а не 20.
// Кейси, де вказівку в описі ловить код (№ 11, 12), модель не викликають і запиту не витрачають.
// Перший 429 зупиняє прогін: цей і решта кейсів — NOT RUN з причиною у звіті, у частку успіху не входять.
// Таймаут, помилка постачальника, відповідь не за схемою — FAIL з причиною (входять у частку успіху).
//   RUNS=2    — кілька прогонів поспіль (до 10 запитів кожен; денний ліміт — 50, спільний із прийманням PM).
//   RECORD=1  — успішні відповіді моделі дописати в tests/fixtures/golden/recorded.json (офлайн-реплей у CI).

const cases = casesJson as GoldenCase[];
const key = process.env.OPENROUTER_API_KEY?.trim();
const RECORD = process.env.RECORD === "1";
const RUNS = Math.max(1, Number(process.env.RUNS ?? 1) || 1);
const RECORDED_PATH = "tests/fixtures/golden/recorded.json";
const REPORT_DIR = "evals/reports";
const NEEDED = RUNS * cases.filter((c) => c.expected.state !== "injection").length;
const GAP_MS = 3_000; // ≤ 20 запитів/хв
const LIVE_TIMEOUT_MS = 15_000; // той самий межа, що в продукті (AC-AI-04)

type Recording = { modelId: string; recordedAt: string; promptVersion: string; text: string };
type Row = { run: number; id: string; modelId: string; state: string; pass: boolean; notRun?: boolean; why?: string };
const rows: Row[] = [];
const fresh: Record<string, Recording> = {};
let stoppedAt: string | undefined;

describe.skipIf(!key)("golden cases, живий прогін (безкоштовні моделі OpenRouter)", () => {
  beforeAll(async () => {
    const res = await fetch("https://openrouter.ai/api/v1/key", { headers: { Authorization: `Bearer ${key}` } });
    const body = (await res.json()) as { data?: { free_model_daily_requests?: { remaining?: number } } };
    const remaining = body.data?.free_model_daily_requests?.remaining;
    if (typeof remaining === "number" && remaining < NEEDED) {
      throw new Error(`Сьогодні лишилось ${remaining} безкоштовних запитів, потрібно ${NEEDED}. Запустіть завтра або зменште RUNS.`);
    }
  });

  for (let run = 1; run <= RUNS; run++) {
    for (const c of cases) {
      it(`прогін ${run}: golden ${c.id}`, async (ctx) => {
        if (stoppedAt) {
          rows.push({ run, id: c.id, modelId: "—", state: "—", pass: false, notRun: true, why: `NOT RUN: зупинено після 429 (${stoppedAt})` });
          return ctx.skip();
        }
        // Модель-обгортка, що запам'ятовує сирий JSON відповіді — для запису RECORD=1 (офлайн-реплей того самого тексту).
        let rawText: string | undefined;
        const base = makeProductModel(key);
        const model = new Proxy(base, {
          get(target, prop, receiver) {
            if (prop !== "doGenerate") return Reflect.get(target, prop, receiver);
            return async (options: Parameters<typeof base.doGenerate>[0]) => {
              const out = await target.doGenerate(options);
              rawText = out.content.map((p) => (p.type === "text" ? p.text : "")).join("");
              return out;
            };
          },
        });
        const calls = c.expected.state === "injection" ? 0 : 1;
        if (calls) await sleep(GAP_MS);
        const result: SuggestResult = await proposeLine(c.input, model, { maxRetries: 0, timeoutMs: LIVE_TIMEOUT_MS });
        if (result.state === "unavailable") {
          stoppedAt = `${c.id}, прогін ${run}`;
          rows.push({ run, id: c.id, modelId: "—", state: result.state, pass: false, notRun: true, why: `NOT RUN: 429 — ${result.message}` });
          return ctx.skip();
        }
        const score = scoreCase(c.expected, result);
        const modelId = result.modelId ?? (calls ? "—" : "код (без моделі)");
        rows.push({ run, id: c.id, modelId, state: result.state, pass: score.pass, why: score.mismatches.join("; ") || undefined });
        // Записуємо лише успішні відповіді моделі: офлайн-реплей у CI має лишатися зеленим.
        if (RECORD && score.pass && rawText && result.modelId) {
          fresh[c.id] = { modelId: result.modelId, recordedAt: new Date().toISOString(), promptVersion: LINE_PROMPT_VERSION, text: rawText };
        }
        expect(score.mismatches).toEqual([]);
      });
    }
  }

  afterAll(() => {
    console.table(rows);
    writeReport();
    if (RECORD && Object.keys(fresh).length > 0) {
      const old = JSON.parse(readFileSync(RECORDED_PATH, "utf8")) as Record<string, Recording>;
      writeFileSync(RECORDED_PATH, JSON.stringify({ ...old, ...fresh }, null, 2) + "\n");
    }
  });
});

// Звіт: частка успіху загалом і за моделлю, кожен кейс, поріг приймання PM (≥ 8 з 10, обов'язково № 1, 8, 11).
function writeReport() {
  if (rows.length === 0) return;
  const ran = rows.filter((r) => !r.notRun);
  const notRun = rows.filter((r) => r.notRun);
  const total = passRate(ran);
  const byModel = new Map<string, Row[]>();
  for (const r of ran) byModel.set(r.modelId, [...(byModel.get(r.modelId) ?? []), r]);
  const mustPass = ["GC-01", "GC-08", "GC-11"];
  const lastRun = rows.filter((r) => r.run === RUNS);
  const threshold =
    lastRun.filter((r) => r.pass).length >= 8 && mustPass.every((id) => lastRun.find((r) => r.id === id)?.pass);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const lines = [
    `# Живий прогін golden cases — ${new Date().toISOString()}`,
    "",
    `- Промпт: \`${LINE_PROMPT_VERSION}\`; ланцюжок моделей: ${PRODUCT_MODELS.map((m) => `\`${m}\``).join(" → ")}; суддя: немає (назву й мету перевіряє код правилом PM «містить»)`,
    `- Прогонів: ${RUNS}; кейсів у прогоні: ${cases.length}; таймаут: ${LIVE_TIMEOUT_MS / 1000} с`,
    `- **Частка успіху: ${total.passed}/${total.total} (${Math.round(total.rate * 100)}%)** — з кейсів, що отримали відповідь`,
    `- Поріг приймання PM (≥ 8 з 10, обов'язково № 1, 8, 11) в останньому прогоні: ${threshold ? "виконано" : "не виконано"}`,
    `- Не запущено (NOT RUN): ${notRun.length}${stoppedAt ? ` — ліміт 429, зупинено на: ${stoppedAt}` : ""}`,
    "",
    "| Модель, що відповіла | Пройшло | Усього |",
    "|---|---|---|",
    ...[...byModel].map(([m, rs]) => `| \`${m}\` | ${passRate(rs).passed} | ${rs.length} |`),
    "",
    "| Прогін | Кейс | Модель | Стан | Результат | Причина |",
    "|---|---|---|---|---|---|",
    ...rows.map(
      (r) => `| ${r.run} | ${r.id} | \`${r.modelId}\` | ${r.state} | ${r.notRun ? "NOT RUN" : r.pass ? "✅" : "❌"} | ${(r.why ?? "").replaceAll("|", "/")} |`,
    ),
    "",
  ];
  mkdirSync(REPORT_DIR, { recursive: true });
  writeFileSync(`${REPORT_DIR}/${stamp}.md`, lines.join("\n"));
  console.log(`Звіт: ${REPORT_DIR}/${stamp}.md`);
}
