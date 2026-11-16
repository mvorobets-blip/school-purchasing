import { APICallError, NoObjectGeneratedError, Output, RetryError, generateText, type LanguageModel } from "ai";
import { MESSAGES } from "@/lib/org/messages";
import { AI_TEXT } from "./messages";
import { LINE_INSTRUCTIONS, wrapDocument } from "./prompts/line";
import { checkLine, looksLikeInjection, type FormLine } from "./rules";
import { LineSuggestionSchema } from "./schema";

// Чиста функція: модель передають параметром (застосунок — src/lib/ai/openrouter.ts, тести — MockLanguageModelV4).
// Без process.env і без "server-only", тож її імпортують тести й живий eval. Модель нічого не пише: результат лише
// заповнює форму, подає її людина (AC-AI-01).

export type SuggestResult =
  | { state: "line"; line: FormLine; modelId: string }
  | {
      state: "off_topic" | "injection" | "invalid" | "failed" | "unavailable";
      message: string;
      issue?: "quantity" | "price";
      modelId?: string;
    };

export type SuggestOptions = { timeoutMs?: number; maxRetries?: number };

// 15 секунд чекання відповіді до повідомлення (AC-AI-04, припущення PM у #71).
export const SUGGEST_TIMEOUT_MS = 15_000;

const failed = (): SuggestResult => ({ state: "failed", message: AI_TEXT.failed });
const unavailable = (): SuggestResult => ({ state: "unavailable", message: AI_TEXT.unavailable });

export async function proposeLine(text: string, model: LanguageModel | null, opts: SuggestOptions = {}): Promise<SuggestResult> {
  // Помічник не налаштований (немає ключа) — те саме, що «недоступний сьогодні» (технічний запасний шлях, не AC).
  if (!model) return unavailable();
  // Вказівки в описі — до виклику моделі (AC-AI-06): так «ігноруй інструкції» не дає рядка з жодною моделлю.
  if (looksLikeInjection(text)) return { state: "injection", message: AI_TEXT.injection };
  if (!text.trim()) return failed();

  let suggestion;
  let modelId: string;
  try {
    const result = await generateText({
      model,
      instructions: LINE_INSTRUCTIONS,
      messages: [{ role: "user", content: [{ type: "text", text: wrapDocument(text) }] }],
      output: Output.object({ name: "line", schema: LineSuggestionSchema }),
      temperature: 0,
      // Безкоштовний тариф: повтор витрачає той самий денний ліміт — без повторів (AC-AI-05).
      maxRetries: opts.maxRetries ?? 0,
      timeout: opts.timeoutMs ?? SUGGEST_TIMEOUT_MS,
    });
    suggestion = result.output;
    modelId = result.response.modelId;
  } catch (error) {
    return classifyFailure(error);
  }

  if (suggestion.status === "off_topic") return { state: "off_topic", message: AI_TEXT.offTopic, modelId };
  if (suggestion.status === "injection") return { state: "injection", message: AI_TEXT.injection, modelId };
  const { name, purpose, quantity, price } = suggestion;
  if (name === null && purpose === null && quantity === null && price === null) return failed();

  const checked = checkLine(suggestion);
  if (checked.kind === "invalid") {
    const message = checked.issue === "quantity" ? MESSAGES.INVALID_QUANTITY : MESSAGES.INVALID_PRICE;
    return { state: "invalid", issue: checked.issue, message, modelId };
  }
  return { state: "line", line: checked.line, modelId };
}

// Збій моделі → стан для людини: ліміт (429, зокрема 429 у тілі відповіді HTTP 200) — AC-AI-05; таймаут, відповідь не за
// схемою чи інша помилка постачальника — AC-AI-04 («не вдалося отримати пропозицію»).
export function classifyFailure(error: unknown): SuggestResult {
  const cause = RetryError.isInstance(error) ? error.lastError : error;
  if (NoObjectGeneratedError.isInstance(cause)) return failed();
  if (APICallError.isInstance(cause)) {
    const code = cause.statusCode === 200 ? (cause.data as { code?: unknown } | undefined)?.code : cause.statusCode;
    if (code === 429 || code === "429") return unavailable();
  }
  return failed();
}

