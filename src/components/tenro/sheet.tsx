import type { ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";

type SheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  children: ReactNode;
};

export function Sheet({ open, onOpenChange, title, description, children }: SheetProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="sheet-overlay" />
        <Dialog.Content className="sheet">
          <div className="sheet-grab" aria-hidden="true" />
          <Dialog.Close className="sheet-close tap" aria-label="Close">
            <X className="size-5" strokeWidth={2} />
          </Dialog.Close>
          <Dialog.Title className="pr-10 text-xl font-semibold tracking-tight">{title}</Dialog.Title>
          <Dialog.Description className="mt-1.5 text-sm leading-relaxed text-muted">
            {description}
          </Dialog.Description>
          <div className="mt-5">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
