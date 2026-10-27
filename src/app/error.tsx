"use client";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

// Межа помилок застосунку. (portal)/error.tsx не перехоплює помилок (portal)/layout.tsx того самого сегмента, а саме
// layout першим викликає getCurrentUser() — його помилку бази (не «гість») ловить ця межа: без бічної панелі, по центру
// (DESIGN.md §6, «Помилка завантаження»). «Try again» — retry() (Next.js ≥ 16.3).
export default function AppError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-4 px-4 py-12 sm:px-6">
      <Alert variant="destructive">Could not load the page. Refresh the page.</Alert>
      <Button variant="outline" className="self-start" onClick={() => retry()}>
        Try again
      </Button>
    </main>
  );
}
