"use client";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

// Помилка завантаження сторінки порталу: показуємо її в каркасі з бічною панеллю, а не порожній стан чи вхід. Помилки
// самого (portal)/layout.tsx (зокрема getCurrentUser) ловить межа рівнем вище — src/app/error.tsx
// (DESIGN.md §6, «Помилка завантаження»). «Try again» — retry(): заново запитує й рендерить сегмент (Next.js ≥ 16.3).
export default function PortalError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <div className="flex flex-col items-start gap-4">
      <Alert variant="destructive">Could not load the page. Refresh the page.</Alert>
      <Button variant="outline" onClick={() => retry()}>
        Try again
      </Button>
    </div>
  );
}
