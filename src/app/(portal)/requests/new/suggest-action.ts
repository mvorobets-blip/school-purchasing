"use server";

import { canUseAssistant } from "@/lib/ai/access";
import { AI_TEXT } from "@/lib/ai/messages";
import { proposeLine, SUGGEST_TIMEOUT_MS, type SuggestResult } from "@/lib/ai/suggest";
import { MAX_DESCRIPTION, normalizeText } from "@/lib/ai/text";
import { getCurrentUser } from "@/lib/org/current-user";
import { messageFor } from "@/lib/org/messages";

export type SuggestActionState = { status: "idle" } | { status: "done"; result: SuggestResult } | { status: "forbidden"; message: string };

// Пропозиція рядка за вільним описом (зріз 4, AC-AI-01…06). Хто питає — до виклику моделі (AGENTS.md): гість чи
// деактивований — відмова без виклику; `admin` — теж відмова: вимога PM стосується лише автора заявки з ролями
// `requester` і `approver` (#71, «Користувачі й ролі»). Дія НІЧОГО не пише в базу: лише повертає пропозицію у форму,
// а подає закупівлю людина наявною дією submitPurchase (AC-AI-01 «закупівлю ще не подано», AC-AI-06 «нової заявки немає»).
export async function requestLineSuggestion(_prev: SuggestActionState, formData: FormData): Promise<SuggestActionState> {
  const user = await getCurrentUser();
  if (!user || !canUseAssistant(user.role)) return { status: "forbidden", message: messageFor("FORBIDDEN") };

  const description = String(formData.get("description") ?? "");
  // Довший за поле форми опис можливий лише в прямому виклику дії: не обрізаємо мовчки (пропозиція не відповідала б
  // введеному) і не женемо весь текст через детектор — збій, як AC-AI-04, модель не викликаємо (відгук викладача WS10).
  // Довжину міряємо ПІСЛЯ тієї самої нормалізації, що в wrapDocument: NFKC розгортає деякі символи («ﬃ» → «ffi»), і опис,
  // що проходить сиру перевірку, інакше все одно мовчки обрізався б (CodeRabbit PR 86).
  if (normalizeText(description).length > MAX_DESCRIPTION) return { status: "done", result: { state: "failed", message: AI_TEXT.failed } };
  // Обгортку з ключем (server-only) вантажимо лише тут, на сервері: клієнтська форма імпортує цю дію як посилання.
  const { productModel } = await import("@/lib/ai/openrouter");
  const result = await proposeLine(description, productModel(), { timeoutMs: SUGGEST_TIMEOUT_MS, maxRetries: 0 });
  return { status: "done", result };
}
