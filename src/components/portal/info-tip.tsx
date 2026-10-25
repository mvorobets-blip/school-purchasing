"use client";

import { Info } from "lucide-react";
import { useId } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

// Пояснення до заголовка: кнопка-іконка «i» (ghost). Popover, а не Tooltip: відкривається і наведенням, і натисканням
// (на телефоні). Текст пояснення прив'язано до кнопки через aria-describedby — зчитувач екрана чує його і без відкриття.
export function InfoTip({ label, children }: { label: string; children: React.ReactNode }) {
  const descriptionId = useId();
  return (
    <Popover>
      <PopoverTrigger
        openOnHover
        delay={150}
        render={<Button type="button" variant="ghost" size="icon-sm" className="text-muted-foreground" />}
        aria-label={label}
        aria-describedby={descriptionId}
      >
        <Info aria-hidden="true" />
      </PopoverTrigger>
      {/* hidden: не входить у текст заголовка, але aria-describedby читає і прихований вузол. */}
      <span id={descriptionId} hidden>
        {children}
      </span>
      <PopoverContent className="max-w-64 text-sm font-normal">
        {children}
      </PopoverContent>
    </Popover>
  );
}
