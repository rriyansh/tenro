import { cn } from "@/lib/cn";

type TenroMarkProps = {
  className?: string;
};

export function TenroMark({ className }: TenroMarkProps) {
  return (
    <svg viewBox="0 0 32 32" className={cn("size-8 text-ink", className)} aria-hidden="true">
      <path
        d="M22.8 7.4a10.2 10.2 0 1 1-7.6-3"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <circle cx="16" cy="16.2" r="3.05" fill="currentColor" />
    </svg>
  );
}
