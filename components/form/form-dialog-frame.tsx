"use client";

import type { FormEvent, ReactNode } from "react";
import { X } from "lucide-react";

type FormDialogFrameProps = {
  title: string;
  submitLabel: string;
  onSubmit: () => void;
  onClose: () => void;
  error?: string;
  children: ReactNode;
};

// Header, scrolling body and Cancel/Submit footer shared by form dialogs.
export function FormDialogFrame({
  title,
  submitLabel,
  onSubmit,
  onClose,
  error,
  children,
}: FormDialogFrameProps) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit();
  }

  return (
    <form onSubmit={handleSubmit} className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
        <h2 className="text-base font-semibold text-zinc-800">{title}</h2>
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="inline-flex size-8 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-100"
        >
          <X className="size-4" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">{children}</div>
      <div className="flex items-center justify-end gap-2 border-t border-zinc-200 px-4 py-3">
        {error ? <p className="mr-auto text-xs text-red-600">{error}</p> : null}
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-9 items-center rounded-md border border-zinc-200 bg-white px-3 text-sm font-medium text-zinc-700"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="inline-flex h-9 items-center rounded-md bg-[#172554] px-3 text-sm font-medium text-white"
        >
          {submitLabel}
        </button>
      </div>
    </form>
  );
}

export function FormField({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`flex flex-col gap-1 text-xs text-zinc-600 ${className ?? ""}`}>
      {label}
      {children}
      {hint ? <span className="text-[11px] text-zinc-400">{hint}</span> : null}
    </label>
  );
}

export function CheckboxField({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-2 text-xs text-zinc-700">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5"
      />
      <span className="flex flex-col">
        {label}
        {hint ? <span className="text-[11px] text-zinc-400">{hint}</span> : null}
      </span>
    </label>
  );
}

export const sectionGridClass = "grid grid-cols-1 gap-3 p-4 sm:grid-cols-4";
export const primaryButtonClass =
  "inline-flex h-9 items-center gap-2 rounded-md bg-[#172554] px-3 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40";
export const secondaryButtonClass =
  "inline-flex h-9 items-center gap-2 rounded-md border border-zinc-200 bg-white px-3 text-sm font-medium text-zinc-700 disabled:cursor-not-allowed disabled:opacity-40";
export const linkButtonClass = "text-xs font-medium text-[#1E40AF]";
export const dangerLinkButtonClass = "text-xs font-medium text-red-600";
