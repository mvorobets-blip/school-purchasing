"use client";

import { MoreHorizontal, Plus, Settings2, ShieldCheck, UserMinus, Zap } from "lucide-react";
import { useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

export type Person = { value: string; label: string };
type FormAction = (formData: FormData) => Promise<void>;
type ToggleAction = (value: boolean, formData: FormData) => Promise<void>;

const formWith = (profileId: string) => {
  const fd = new FormData();
  fd.set("profileId", profileId);
  return fd;
};

// Кнопка відправки, вимкнена під час виконання дії — без повторного надсилання.
function SubmitButton({ disabled, children }: { disabled: boolean; children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={disabled || pending}>
      {pending ? "Зберігаємо…" : children}
    </Button>
  );
}

// Форма з вибором працівника в діалозі; дія — серверна (RPC з перевіркою адміністратора), результат — у ?ok= / ?error=.
function PersonForm({
  id,
  action,
  people,
  submitLabel,
  label,
}: {
  id: string;
  action: FormAction;
  people: Person[];
  submitLabel: string;
  label: string;
}) {
  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor={id}>{label}</Label>
        <Select name="profileId" items={people} required>
          <SelectTrigger id={id} className="w-full">
            <SelectValue placeholder="Оберіть працівника" />
          </SelectTrigger>
          <SelectContent>
            {people.map((p) => (
              <SelectItem key={p.value} value={p.value}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <DialogFooter>
        <DialogClose render={<Button type="button" variant="outline" />}>Скасувати</DialogClose>
        <SubmitButton disabled={people.length === 0}>{submitLabel}</SubmitButton>
      </DialogFooter>
    </form>
  );
}

// Головна дія сторінки — «Додати заявника»; рідші дії — у меню «Ще дії».
// Призначення схвалювачем і автосхвалення пропонують усіх працівників: не заявника відхилить база з
// «Спершу додайте працівника до відділу як заявника» (AC-ORG-02, AC-ORG-33).
export function DepartmentActions({
  addRequester,
  setApprover,
  setAutoApprove,
  candidates,
  everyone,
}: {
  addRequester: FormAction;
  setApprover: FormAction;
  setAutoApprove: FormAction;
  candidates: Person[];
  everyone: Person[];
}) {
  const [dialog, setDialog] = useState<"approver" | "auto" | null>(null);

  return (
    <div className="flex flex-wrap gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="outline" />}>
          <Settings2 aria-hidden="true" />
          Ще дії
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-60">
          <DropdownMenuItem onClick={() => setDialog("approver")}>
            <ShieldCheck aria-hidden="true" />
            Призначити схвалювачем…
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setDialog("auto")}>
            <Zap aria-hidden="true" />
            Увімкнути автосхвалення…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog>
        <DialogTrigger render={<Button />}>
          <Plus aria-hidden="true" />
          Додати заявника
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Додати заявника</DialogTitle>
            <DialogDescription>Заявник подає заявки від імені цього відділу.</DialogDescription>
          </DialogHeader>
          {candidates.length === 0 ? (
            <p className="text-sm text-muted-foreground">Усі працівники вже є заявниками цього відділу.</p>
          ) : null}
          <PersonForm
            id="add-requester-profile"
            label="Працівник"
            action={addRequester}
            people={candidates}
            submitLabel="Додати"
          />
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === "approver"} onOpenChange={(open) => setDialog(open ? "approver" : null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Призначити схвалювачем</DialogTitle>
            <DialogDescription>Схвалювачем можна призначити лише заявника цього відділу.</DialogDescription>
          </DialogHeader>
          <PersonForm
            id="assign-approver-profile"
            label="Працівник"
            action={setApprover}
            people={everyone}
            submitLabel="Призначити"
          />
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === "auto"} onOpenChange={(open) => setDialog(open ? "auto" : null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Увімкнути автосхвалення</DialogTitle>
            <DialogDescription>Заявки цього працівника у відділі схвалюватимуться без схвалювача.</DialogDescription>
          </DialogHeader>
          <PersonForm
            id="auto-approve-profile"
            label="Працівник"
            action={setAutoApprove}
            people={everyone}
            submitLabel="Увімкнути"
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Перемикач у рядку заявника: схвалювач чи автосхвалення. Зміну зберігає серверна дія одразу.
export function MemberSwitch({
  profileId,
  checked,
  action,
  label,
}: {
  profileId: string;
  checked: boolean;
  action: ToggleAction;
  label: string;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <Switch
      checked={checked}
      disabled={pending}
      aria-label={label}
      onCheckedChange={(value) => startTransition(() => action(value, formWith(profileId)))}
    />
  );
}

// Меню рядка: рідкісна й незворотна дія «Прибрати із заявників» — окремо від перемикачів і з підтвердженням,
// бо разом із членством знімаються схвалення й автосхвалення в цьому відділі (AC-ORG-03, AC-ORG-15).
export function MemberMenu({ profileId, name, remove }: { profileId: string; name: string; remove: FormAction }) {
  const [confirm, setConfirm] = useState(false);
  const [pending, startTransition] = useTransition();
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="ghost" size="icon-sm" disabled={pending} />}
          aria-label={`Дії для ${name}`}
        >
          <MoreHorizontal aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem variant="destructive" onClick={() => setConfirm(true)}>
            <UserMinus aria-hidden="true" />
            Прибрати із заявників
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Прибрати із заявників?</DialogTitle>
            <DialogDescription>
              {name} більше не подаватиме заявки від цього відділу; схвалення й автосхвалення в цьому відділі теж буде
              знято.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>Скасувати</DialogClose>
            <Button
              type="button"
              variant="destructive"
              disabled={pending}
              onClick={() => startTransition(() => remove(formWith(profileId)))}
            >
              Прибрати
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
