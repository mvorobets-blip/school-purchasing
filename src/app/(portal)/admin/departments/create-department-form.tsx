"use client";

import { Plus } from "lucide-react";
import { useActionState, useState } from "react";
import { Alert } from "@/components/ui/alert";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DEPARTMENT_NAME_MAX } from "@/lib/org/departments";
import { createDepartment, type CreateDepartmentState } from "./actions";

const initialState: CreateDepartmentState = { status: "idle", message: "" };

// Кнопка «Створити відділ» над списком і форма в діалозі. Помилка (дубль назви, AC-ORG-34) — у діалозі;
// після успіху діалог закривається, а повідомлення видно над списком.
export function CreateDepartmentDialog() {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(async (prev: CreateDepartmentState, formData: FormData) => {
    const next = await createDepartment(prev, formData);
    if (next.status === "ok") setOpen(false);
    return next;
  }, initialState);

  return (
    <>
      {state.status === "ok" ? (
        <Alert role="status" data-testid="create-department-message" className="order-last basis-full">
          {state.message}
        </Alert>
      ) : null}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger render={<Button />}>
          <Plus aria-hidden="true" />
          Create department
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New department</DialogTitle>
            <DialogDescription>Name — up to {DEPARTMENT_NAME_MAX} characters, no duplicates.</DialogDescription>
          </DialogHeader>
          <form action={formAction} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="department-name">Department name</Label>
              <Input id="department-name" name="name" required maxLength={DEPARTMENT_NAME_MAX} autoFocus />
            </div>
            {state.status === "error" ? (
              <Alert variant="destructive" data-testid="create-department-message">
                {state.message}
              </Alert>
            ) : null}
            <DialogFooter>
              <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
              <Button type="submit" disabled={pending}>
                {pending ? "Creating…" : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
