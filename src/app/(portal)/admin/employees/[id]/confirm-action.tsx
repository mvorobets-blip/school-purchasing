"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

// Рідкісна дія з наслідками (деактивація, зняття ролі адміністратора) — лише після підтвердження, як «Remove from
// requesters» на сторінці відділу: видати роль admin у застосунку не можна, тож випадковий клік важко відкотити.
export function ConfirmAction({
  action,
  label,
  title,
  description,
  testId,
}: {
  action: () => Promise<void>;
  label: string;
  title: string;
  description: string;
  testId: string;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <Dialog>
      <DialogTrigger render={<Button type="button" variant="destructive" data-testid={testId} />}>{label}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
          <Button
            type="button"
            variant="destructive"
            disabled={pending}
            data-testid={`${testId}-confirm`}
            onClick={() => startTransition(() => action())}
          >
            {label}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
