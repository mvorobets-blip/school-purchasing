import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export type AwaitingRequest = { id: string; department_id: string; purchase_type: string; created_at: string };
export type AwaitingDecision = { departmentIds: string[]; requests: AwaitingRequest[]; failed: boolean };

// Заявки на рішення поточного користувача: подані в його відділи, де він схвалювач, крім власних (AC-APR-01).
// Ті самі умови, що й на /approvals. cache(): бічна панель (лічильник) і головна в одному запиті читають один раз.
export const getAwaitingDecision = cache(async (userId: string): Promise<AwaitingDecision> => {
  const supabase = await createClient();
  const { data: memberships, error } = await supabase
    .from("department_members")
    .select("department_id")
    .eq("profile_id", userId)
    .eq("is_approver", true);
  if (error) return { departmentIds: [], requests: [], failed: true };

  const departmentIds = memberships.map((m) => m.department_id);
  if (departmentIds.length === 0) return { departmentIds, requests: [], failed: false };

  const { data: requests, error: requestsError } = await supabase
    .from("purchase_requests")
    .select("id, department_id, purchase_type, created_at")
    .in("department_id", departmentIds)
    .eq("status", "pending")
    .neq("author_id", userId)
    .order("created_at");
  return { departmentIds, requests: requests ?? [], failed: Boolean(requestsError) };
});
