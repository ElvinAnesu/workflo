import type { ButtonHTMLAttributes, ReactNode } from "react";

type HeaderIconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  children: ReactNode;
};

export function HeaderIconButton({
  label,
  children,
  className = "",
  type = "button",
  ...props
}: HeaderIconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      className={`inline-flex size-9 items-center justify-center rounded-md border border-zinc-200 bg-white text-zinc-600 shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-colors hover:bg-zinc-50 ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
