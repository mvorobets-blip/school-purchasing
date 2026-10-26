"use client";

import {
  Building2,
  ClipboardList,
  Inbox,
  ChevronDown,
  ChevronsUpDown,
  LayoutDashboard,
  LogOut,
  Plus,
  ShoppingBasket,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarTrigger,
} from "@/components/ui/sidebar";

export type SidebarUser = { name: string; email: string | null; roleLabel: string; initials: string; isAdmin: boolean; isApprover: boolean };

type Page = { href: string; label: string; icon: LucideIcon };
type Section = { label: string; pages: Page[] };

// Розділи меню за роллю: розділ — заголовок, що згортається; сторінки — пункти з іконкою.
function sectionsFor(user: SidebarUser): Section[] {
  const sections: Section[] = [
    {
      label: "Overview",
      pages: [
        { href: "/", label: "Home", icon: LayoutDashboard },
        { href: "/profile", label: "My profile", icon: UserRound },
      ],
    },
  ];
  sections.push({
    label: "Requests",
    pages: [
      { href: "/requests/new", label: "New purchase", icon: Plus },
      { href: "/requests", label: "My requests", icon: ClipboardList },
      // Список для рішення — лише схвалювачам (AC-APR-04: заявник його не бачить).
      ...(user.isApprover ? [{ href: "/approvals", label: "Awaiting decision", icon: Inbox }] : []),
    ],
  });
  if (user.isAdmin) {
    sections.push({ label: "Administration", pages: [{ href: "/admin/departments", label: "Departments", icon: Building2 }] });
  }
  return sections;
}

// «Мої заявки» активні й на сторінці заявки, але не на «Новій закупівлі».
const isActive = (pathname: string, href: string) => {
  if (href === "/") return pathname === "/";
  if (href === "/requests") return pathname === "/requests" || (pathname.startsWith("/requests/") && pathname !== "/requests/new");
  return pathname.startsWith(href);
};

// Бічна панель порталу: розгорнута — з підписами, згорнута — тонка смуга з іконками й підказками (collapsible="icon");
// на телефоні — висувна панель. Стан згортання пам'ятає cookie sidebar_state (компонент shadcn/ui).
export function AppSidebar({ user, signOut }: { user: SidebarUser; signOut: () => Promise<void> }) {
  const pathname = usePathname();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-2 px-1 py-1 group-data-[collapsible=icon]:flex-col">
          <Link href="/" className="flex min-w-0 flex-1 items-center gap-2 font-semibold">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
              <ShoppingBasket className="size-4" aria-hidden="true" />
            </span>
            <span className="truncate group-data-[collapsible=icon]:hidden">School Purchasing</span>
          </Link>
          <SidebarTrigger aria-label="Toggle menu" />
        </div>
      </SidebarHeader>

      <SidebarContent>
        {sectionsFor(user).map((section) => (
          <Collapsible key={section.label} defaultOpen className="group/section">
            <SidebarGroup>
              <SidebarGroupLabel
                render={<CollapsibleTrigger />}
                className="text-[0.8125rem] font-semibold tracking-wide text-sidebar-foreground uppercase hover:bg-sidebar-accent"
              >
                {section.label}
                <ChevronDown
                  className="ml-auto size-4 transition-transform group-data-[closed]/section:-rotate-90"
                  aria-hidden="true"
                />
              </SidebarGroupLabel>
              <CollapsibleContent keepMounted className="group-data-[collapsible=icon]:!block">
                <SidebarGroupContent className="ml-3.5 border-l border-sidebar-border pl-2 group-data-[collapsible=icon]:ml-0 group-data-[collapsible=icon]:border-0 group-data-[collapsible=icon]:pl-0">
                  <SidebarMenu>
                    {section.pages.map((page) => (
                      <SidebarMenuItem key={page.href}>
                        <SidebarMenuButton
                          isActive={isActive(pathname, page.href)}
                          tooltip={page.label}
                          render={<Link href={page.href} />}
                          className="data-active:rounded-l-none data-active:border-l-2 data-active:border-sidebar-primary data-active:font-medium"
                        >
                          <page.icon aria-hidden="true" />
                          <span>{page.label}</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </CollapsibleContent>
            </SidebarGroup>
          </Collapsible>
        ))}
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={<SidebarMenuButton size="lg" tooltip={user.name} />}
                aria-label="User menu"
              >
                <Avatar className="size-8 rounded-lg">
                  <AvatarFallback className="rounded-lg bg-sidebar-accent font-semibold text-sidebar-accent-foreground">{user.initials}</AvatarFallback>
                </Avatar>
                <span className="grid min-w-0 flex-1 text-left leading-tight">
                  <span className="truncate font-medium">{user.name}</span>
                  <span className="truncate text-sm text-muted-foreground">{user.roleLabel}</span>
                </span>
                <ChevronsUpDown className="ml-auto size-4" aria-hidden="true" />
              </DropdownMenuTrigger>
              <DropdownMenuContent side="right" align="end" className="min-w-56">
                <DropdownMenuGroup>
                  <DropdownMenuLabel>
                    <span className="block truncate font-medium text-foreground">{user.email ?? user.name}</span>
                    <span className="block text-sm text-muted-foreground">{user.roleLabel}</span>
                  </DropdownMenuLabel>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem render={<Link href="/profile" />}>
                  <UserRound aria-hidden="true" />
                  My profile
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => void signOut()}>
                  <LogOut aria-hidden="true" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
