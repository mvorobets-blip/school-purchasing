import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { CurrentUser } from "./access";
import type { Role } from "./roles";

export type PortalUser = CurrentUser & { id: string; email: string | null; fullName: string | null };

// Профіль користувача поточного запиту. Авторизація — getClaims(), не getSession().
// RLS віддає профіль лише активному користувачу, тож деактивований отримає null. Помилка бази — не «гість»: кидаємо
// її, і сторінку замінює (portal)/error.tsx, а не перенаправлення на вхід, ніби людина не увійшла.
// cache(): оболонка порталу й сторінка в одному запиті читають профіль один раз.
export const getCurrentUser = cache(async (): Promise<PortalUser | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) return null;

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id, email, full_name, role, is_active")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error("Could not load the current user profile");
  if (!profile) return null;

  return {
    id: profile.id,
    email: profile.email,
    fullName: profile.full_name,
    role: profile.role as Role,
    isActive: profile.is_active,
  };
});
