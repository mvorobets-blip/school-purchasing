import { ShoppingBasket } from "lucide-react";
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AppSidebar } from "@/components/portal/app-sidebar";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { getCurrentUser } from "@/lib/org/current-user";
import { initials } from "@/lib/org/permissions";
import { ROLE_LABEL } from "@/lib/org/roles";
import { signOut } from "../login/actions";

// Оболонка порталу для всіх сторінок після входу: бічна панель з розділами за роллю й користувачем.
// На комп'ютері окремої шапки немає; на телефоні — тонка смуга з кнопкою меню.
// Права на сторінки однаково перевіряють самі сторінки й RLS; меню лише ховає недоступні пункти.
export default async function PortalLayout({ children }: LayoutProps<"/">) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const cookieStore = await cookies();
  const defaultOpen = cookieStore.get("sidebar_state")?.value !== "false";

  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <AppSidebar
        signOut={signOut}
        user={{
          name: user.fullName ?? user.email ?? "—",
          email: user.email,
          roleLabel: ROLE_LABEL[user.role],
          initials: initials(user.fullName, user.email),
          isAdmin: user.role === "admin",
        }}
      />
      <SidebarInset className="bg-transparent">
        <header className="flex items-center gap-3 border-b px-4 py-2.5 sm:px-8">
          <SidebarTrigger aria-label="Open menu" className="md:hidden" />
          <Link href="/" className="flex items-center gap-2 font-semibold md:hidden">
            <ShoppingBasket className="size-4 text-accent-foreground" aria-hidden="true" />
            School Purchasing
          </Link>
          <div className="ml-auto flex items-center gap-2 text-sm">
            <Avatar className="size-8">
              <AvatarFallback className="bg-accent text-xs font-semibold text-accent-foreground">
                {initials(user.fullName, user.email)}
              </AvatarFallback>
            </Avatar>
            <span className="hidden sm:inline">
              {user.fullName ?? user.email} · <span className="text-muted-foreground">{ROLE_LABEL[user.role]}</span>
            </span>
          </div>
        </header>
        <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-6 sm:px-8 sm:py-8">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
