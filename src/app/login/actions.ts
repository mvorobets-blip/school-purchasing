"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Вхід email + пароль. Реєстрації в шаблоні немає: користувачів створює
// scripts/create-demo-users.mjs (Admin API), бо вбудований SMTP Supabase
// надсилає лише 2 листи/год і лише членам команди проєкту.
// Помилку повертаємо станом форми (useActionState), а не параметром URL: так email лишається в полі після невдалого
// входу, а в адресу не потрапляють особисті дані. Код помилки — ключ текстів на сторінці входу.
export type LoginState = { error: "missing" | "invalid" | "inactive" | "unavailable" | null; email: string };

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) return { error: "missing", email };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  // Не показуємо текст помилки Auth: він може підказати, чи існує email.
  if (error) return { error: "invalid", email };

  // Деактивований працівник не входить (AC-ORG-12): RLS не віддає йому навіть власного профілю, тож відсутній чи
  // неактивний профіль — вихід і повідомлення на сторінці входу. Помилка читання профілю — не «деактивовано»:
  // активному працівнику показуємо нейтральне «спробуйте ще раз», а не хибну причину.
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("is_active")
    .eq("id", data.user.id)
    .maybeSingle();
  if (profileError) {
    await supabase.auth.signOut();
    return { error: "unavailable", email };
  }
  if (!profile?.is_active) {
    await supabase.auth.signOut();
    return { error: "inactive", email };
  }

  revalidatePath("/", "layout");
  redirect("/");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}
