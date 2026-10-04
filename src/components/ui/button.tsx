import type { ButtonHTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

const button = cva("tap inline-flex items-center justify-center gap-2", {
  variants: {
    variant: {
      primary: "btn-primary h-14 rounded-full px-6 text-base font-semibold",
      quiet: "btn-quiet rounded-full text-sm font-medium",
    },
  },
  defaultVariants: { variant: "primary" },
});

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof button>;

export function Button({ className, variant, type = "button", ...props }: ButtonProps) {
  return <button type={type} className={cn(button({ variant }), className)} {...props} />;
}
