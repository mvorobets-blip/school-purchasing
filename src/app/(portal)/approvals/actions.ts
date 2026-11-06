"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/org/current-user";
import { messageFor } from "@/lib/org/messages";
import { isTextLengthError, REASON_LIMIT, REASON_TOO_LONG, textLength } from "@/lib/purchase/form";
import { createClient } from "@/lib/supabase/server";

export type DecisionState = { status: "idle" | "error"; message: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type RpcError = { code?: string; message?: string } | null;

// Позиції рядків з прапорців «Reject line» (name="rejectLine", value — позиція рядка). Неможливе значення — null:
// тоді рішення не надсилаємо (інакше підроблена форма перетворила б часткове схвалення на повне).
function rejectedPositions(formData: FormData): number[] | null {
  const values = formData.getAll("rejectLine").map((v) => Number(v));
  if (values.some((n) => !Number.isInteger(n) || n < 1)) return null;
  return [...new Set(values)];
}

const CHANGED = "The request has changed. Refresh the page.";

function errorMessage(error: RpcError): string {
  if (error?.message?.includes("NO_REASON")) return messageFor("NO_REASON");
  if (error?.message?.includes("ALL_LINES_REJECTED")) return messageFor("ALL_LINES_REJECTED");
  // Позначено рядок, якого в заявці вже немає, чи невідоме рішення — повтор тієї самої форми не допоможе.
  if (error?.message?.includes("INVALID_LINE") || error?.message?.includes("INVALID_DECISION")) return CHANGED;
  if (error?.message?.includes("NOT_PENDING")) return "This request has already been decided.";
  if (error?.code === "42501" || error?.message?.includes("FORBIDDEN")) return messageFor("FORBIDDEN");
  if (isTextLengthError(error)) return REASON_TOO_LONG;
  return "Could not save the decision. Try again.";
}

// Рішення схвалювача. Права (схвалювач відділу, не автор, статус «Очікує схвалення», причина для відхилення) перевіряє
// private.decide_purchase у базі: дію можна викликати напряму (AC-APR-03, 04, 05). Порожня причина — «Provide a reason»
// без звернення до бази (AC-APR-06); успіх — назад до списку з повідомленням.
export async function decidePurchase(
  requestId: string,
  decision: "approve" | "reject",
  _prev: DecisionState,
  formData: FormData,
): Promise<DecisionState> {
  const user = await getCurrentUser();
  if (!user || !UUID.test(requestId)) return { status: "error", message: messageFor("FORBIDDEN") };

  const reason = String(formData.get("reason") ?? "").trim();
  if (decision === "reject" && !reason) return { status: "error", message: messageFor("NO_REASON") };
  if (decision === "reject" && textLength(reason) > REASON_LIMIT) return { status: "error", message: REASON_TOO_LONG };

  // Позначені «Reject line» рядки (позиції) — лише для схвалення; усі позначені база відхиляє з ALL_LINES_REJECTED (AC-DEC-01).
  const rejected = decision === "approve" ? rejectedPositions(formData) : [];
  if (rejected === null) return { status: "error", message: CHANGED };

  const supabase = await createClient();
  const { error } = await supabase.rpc("decide_purchase", {
    p_request_id: requestId,
    p_decision: decision,
    p_reason: decision === "reject" ? reason : null,
    p_rejected_positions: rejected,
  });
  if (error) return { status: "error", message: errorMessage(error) };

  revalidatePath("/approvals");
  revalidatePath("/requests");
  const ok = decision === "reject" ? "REJECTED" : rejected.length > 0 ? "PARTIALLY_APPROVED" : "APPROVED";
  redirect(`/approvals?ok=${ok}`);
}
