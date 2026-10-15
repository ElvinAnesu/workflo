"use client";

import { Download, MoreVertical, Plus, Upload } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { downloadCsv } from "@/components/payroll/csv-export";
import type { DataTableColumn } from "@/components/table/data-table.types";

const SKIPPED_KEYS = new Set(["index", "actions", "select"]);

// Exports every row passed in, using the table's own column labels.
export function exportTable<T>(
  filename: string,
  columns: DataTableColumn<T>[],
  rows: T[],
) {
  const exported = columns.filter(
    (column) => column.exportValue !== false && !SKIPPED_KEYS.has(column.key),
  );
  downloadCsv(
    filename,
    exported.map((column) => column.label),
    rows.map((row) =>
      exported.map((column) => {
        if (typeof column.exportValue === "function") {
          return column.exportValue(row);
        }
        const value = (row as Record<string, unknown>)[column.key];
        if (Array.isArray(value)) {
          return value.join("; ");
        }
        return typeof value === "number" ? value : String(value ?? "");
      }),
    ),
  );
}

type TableActionsProps = {
  onExport?: () => void;
  exportDisabled?: boolean;
  onImport?: () => void;
  onAdd?: () => void;
  addLabel?: string;
  children?: ReactNode;
};

export function TableActions({
  onExport,
  exportDisabled,
  onImport,
  onAdd,
  addLabel = "Add",
  children,
}: TableActionsProps) {
  return (
    <>
      {children}
      {onExport ? (
        <button
          type="button"
          onClick={onExport}
          disabled={exportDisabled}
          className="inline-flex h-9 items-center gap-2 rounded-md bg-[#22C55E] px-3 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Download className="size-4" />
          Export
        </button>
      ) : null}
      {onImport ? (
        <button
          type="button"
          onClick={onImport}
          className="inline-flex h-9 items-center gap-2 rounded-md bg-[#1E40AF] px-3 text-sm font-medium text-white"
        >
          <Upload className="size-4" />
          Import
        </button>
      ) : null}
      {onAdd ? (
        <button
          type="button"
          onClick={onAdd}
          className="inline-flex h-9 items-center gap-2 rounded-md bg-[#172554] px-3 text-sm font-medium text-white"
        >
          <Plus className="size-4" />
          {addLabel}
        </button>
      ) : null}
    </>
  );
}

export function RowActions({
  onEdit,
  onDelete,
  children,
}: {
  onEdit?: () => void;
  onDelete?: () => void;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: 0, left: 0, up: false });

  useEffect(() => {
    if (!open) {
      return;
    }
    function closeOnOutside(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) {
        return;
      }
      setOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  function toggle() {
    const button = rootRef.current?.querySelector("button");
    if (!button) {
      return;
    }
    const rect = button.getBoundingClientRect();
    const width = 176;
    const left = Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8));
    const up = rect.bottom + 220 > window.innerHeight && rect.top > 220;
    const top = up ? rect.top - 4 : rect.bottom + 4;
    setPosition({ top, left, up });
    setOpen((current) => !current);
  }

  return (
    <div ref={rootRef} className="inline-flex">
      <button
        type="button"
        aria-label="Actions"
        aria-expanded={open}
        onClick={toggle}
        className="inline-flex size-7 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-100"
      >
        <MoreVertical className="size-4" />
      </button>
      {open ? (
        <div
          ref={menuRef}
          role="menu"
          style={{ top: position.top, left: position.left, transform: position.up ? "translateY(-100%)" : undefined }}
          className="fixed z-50 w-44 rounded-md border border-zinc-200 bg-white py-1 shadow-md [&_a]:flex [&_a]:w-full [&_a]:items-center [&_a]:px-3 [&_a]:py-1.5 [&_a]:text-left [&_a]:text-xs [&_a]:font-medium [&_a]:text-[#1E40AF] [&_a]:hover:bg-zinc-50 [&_button]:flex [&_button]:w-full [&_button]:items-center [&_button]:bg-transparent [&_button]:px-3 [&_button]:py-1.5 [&_button]:text-left [&_button]:text-xs [&_button]:font-medium [&_button]:hover:bg-zinc-50"
          onClick={(event) => {
            const target = event.target;
            if (target instanceof Element && target.closest("button, a")) {
              setOpen(false);
            }
          }}
        >
          {children}
          {onEdit ? (
            <button type="button" onClick={onEdit} className="text-[#1E40AF]">
              Edit
            </button>
          ) : null}
          {onDelete ? (
            <button type="button" onClick={onDelete} className="text-red-600">
              Delete
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
