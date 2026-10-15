import type { PayrollRunStatus } from "@/components/payroll/payroll.types";

const STATUS_CLASSES: Record<PayrollRunStatus, string> = {
  Draft: "bg-amber-50 text-amber-700 ring-amber-200",
  Approved: "bg-blue-50 text-blue-700 ring-blue-200",
  Locked: "bg-emerald-50 text-emerald-700 ring-emerald-200",
};

export function RunStatusBadge({ status }: { status: PayrollRunStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${STATUS_CLASSES[status]}`}
    >
      {status}
    </span>
  );
}
