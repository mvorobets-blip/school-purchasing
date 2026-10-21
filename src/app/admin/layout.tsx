import Link from "next/link";
import { redirect } from "next/navigation";
import { canAccessSettings } from "@/lib/org/access";
import { getCurrentUser } from "@/lib/org/current-user";
import { messageFor } from "@/lib/org/messages";

// Усі сторінки /admin/** — лише для активного адміністратора (AC-ORG-09).
// Не-адміністратор бачить «Недостатньо прав»; дані однаково не віддає RLS (private.is_admin()).
export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  if (!canAccessSettings(user)) {
    return (
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-6 py-16">
        <p role="alert" data-testid="forbidden" className="text-lg font-medium text-red-600">
          {messageFor("FORBIDDEN")}
        </p>
        <Link href="/" className="text-sm underline">
          На головну
        </Link>
      </main>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-10">
      <nav className="flex gap-4 text-sm">
        <Link href="/" className="underline">
          Головна
        </Link>
        <Link href="/admin/departments" className="underline">
          Відділи
        </Link>
      </nav>
      {children}
    </div>
  );
}
