"use client";

import { Check, Lock, RefreshCw } from "lucide-react";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { usePageCan } from "@/components/table/table-actions";
import { featureForPath } from "@/lib/access";
import {
  primaryButtonClass,
  secondaryButtonClass,
} from "@/components/form/form-dialog-frame";
import { formControlClass } from "@/components/form/form-control";
import type { PayrollRunStatus } from "@/components/payroll/payroll.types";

// Pieces shared by the monthly, mid-month and overtime payroll screens.

const STEPS = ["Draft", "Approved", "Locked"] as const;

export const cardClass = "rounded-lg border border-zinc-200/80 bg-white";
export const thClass =
  "px-3 py-2.5 text-left text-xs font-semibold whitespace-nowrap text-zinc-500";
export const thNumClass =
  "px-3 py-2.5 text-right text-xs font-semibold whitespace-nowrap text-zinc-500";
export const tdClass = "px-3 py-2 text-xs whitespace-nowrap text-zinc-700";
export const tdNumClass =
  "px-3 py-2 text-right text-xs whitespace-nowrap text-zinc-700 tabular-nums";

export function Stepper({ status }: { status: PayrollRunStatus }) {
  const current = STEPS.indexOf(status);
  return (
    <ol className="flex items-center gap-2 text-xs">
      {STEPS.map((step, index) => (
        <li key={step} className="flex items-center gap-2">
          <span
            className={`flex size-5 items-center justify-center rounded-full text-[10px] font-semibold ${
              index < current
                ? "bg-[#172554] text-white"
                : index === current
                  ? "bg-[#1E40AF] text-white ring-4 ring-blue-100"
                  : "bg-zinc-100 text-zinc-400"
            }`}
          >
            {index < current ? <Check className="size-3" /> : index + 1}
          </span>
          <span className={index <= current ? "font-medium text-zinc-800" : "text-zinc-400"}>
            {step}
          </span>
          {index < STEPS.length - 1 ? (
            <span className="mx-1 h-px w-8 bg-zinc-200" />
          ) : null}
        </li>
      ))}
    </ol>
  );
}

export function Tile({ label, value, note }: { label: string; value: string; note?: ReactNode }) {
  return (
    <div className={`${cardClass} flex flex-col gap-1 p-4`}>
      <span className="text-xs text-zinc-500">{label}</span>
      <span className="text-lg font-semibold tracking-tight text-zinc-900 tabular-nums">
        {value}
      </span>
      {note ? <span className="text-[11px] text-zinc-500">{note}</span> : null}
    </div>
  );
}

export type RunMessage = { tone: "error" | "ok"; text: string } | null;

export function RunMessageBar({ message }: { message: RunMessage }) {
  if (!message) {
    return null;
  }
  return (
    <p
      className={`rounded-md px-3 py-2 text-xs ${
        message.tone === "error" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"
      }`}
    >
      {message.text}
    </p>
  );
}

export function runMeta(run: {
  calculatedOn: string;
  approvedBy: string;
  approvedOn: string;
  lockedOn: string;
}) {
  return [
    run.calculatedOn ? `Calculated ${new Date(run.calculatedOn).toLocaleString("en-GB")}` : "",
    run.approvedOn ? `approved by ${run.approvedBy} on ${run.approvedOn}` : "",
    run.lockedOn ? `locked on ${run.lockedOn}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

type RunWorkflowBarProps = {
  status: PayrollRunStatus;
  onRecalculate?: () => void;
  onApprove: (approver: string) => void;
  approveBlockedReason?: string;
  onReopen: () => void;
  onLock: () => void;
  onDelete: () => void;
  onMessage: (message: RunMessage) => void;
  children?: ReactNode;
};

// Draft → Approved → Locked actions; `children` go on the right.
export function RunWorkflowBar({
  status,
  onRecalculate,
  onApprove,
  approveBlockedReason,
  onReopen,
  onLock,
  onDelete,
  onMessage,
  children,
}: RunWorkflowBarProps) {
  const [approving, setApproving] = useState(false);
  const [approver, setApprover] = useState("");
  const feature = featureForPath(usePathname());
  const canRun = usePageCan("run");
  const canApproveFlag = usePageCan("approve");
  const canApprove = feature === "monthlyPayrollProcessing" ? canApproveFlag : canRun;
  const canEdit = usePageCan("edit");
  const canDelete = usePageCan("delete");

  function handleApprove() {
    if (!approver.trim()) {
      onMessage({ tone: "error", text: "Enter the approver's name." });
      return;
    }
    onApprove(approver.trim());
    setApproving(false);
  }

  return (
    <div className="flex flex-wrap items-center gap-2 print:hidden">
      {status === "Draft" ? (
        <>
          {onRecalculate && canRun ? (
            <button type="button" onClick={onRecalculate} className={secondaryButtonClass}>
              <RefreshCw className="size-4" />
              Recalculate
            </button>
          ) : null}
          {canApprove ? (
            approving ? (
            <span className="flex items-center gap-2">
              <input
                autoFocus
                placeholder="Approver name"
                value={approver}
                onChange={(event) => setApprover(event.target.value)}
                className={`${formControlClass} h-9 w-48`}
              />
              <button type="button" onClick={handleApprove} className={primaryButtonClass}>
                Confirm approval
              </button>
              <button
                type="button"
                onClick={() => setApproving(false)}
                className={secondaryButtonClass}
              >
                Cancel
              </button>
            </span>
            ) : (
            <button
              type="button"
              disabled={Boolean(approveBlockedReason)}
              title={approveBlockedReason}
              onClick={() => setApproving(true)}
              className={primaryButtonClass}
            >
              <Check className="size-4" />
              Approve
            </button>
            )
          ) : null}
          {canDelete ? (
          <button
            type="button"
            onClick={onDelete}
            className="inline-flex h-9 items-center rounded-md px-2 text-sm font-medium text-red-600 hover:bg-red-50"
          >
            Delete draft
          </button>
          ) : null}
        </>
      ) : null}
      {status === "Approved" ? (
        <>
          {canRun ? (
          <button type="button" onClick={onLock} className={primaryButtonClass}>
            <Lock className="size-4" />
            Lock
          </button>
          ) : null}
          {canEdit ? (
          <button type="button" onClick={onReopen} className={secondaryButtonClass}>
            Back to draft
          </button>
          ) : null}
        </>
      ) : null}
      {children ? <span className="ml-auto flex flex-wrap gap-2">{children}</span> : null}
    </div>
  );
}

export function currentPeriod() {
  return new Date().toISOString().slice(0, 7);
}
