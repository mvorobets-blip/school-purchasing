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

function errorMessage(error: RpcError): string {
  if (error?.message?.includes("NO_REASON")) return messageFor("NO_REASON");
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

  const supabase = await createClient();
  const { error } = await supabase.rpc("decide_purchase", {
    p_request_id: requestId,
    p_decision: decision,
    p_reason: decision === "reject" ? reason : null,
  });
  if (error) return { status: "error", message: errorMessage(error) };

  revalidatePath("/approvals");
  revalidatePath("/requests");
  redirect(`/approvals?ok=${decision === "approve" ? "APPROVED" : "REJECTED"}`);
}
