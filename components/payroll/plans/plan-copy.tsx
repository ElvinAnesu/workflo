import { addMonths, type PlanDisplayStatus } from "@/components/payroll/deduction-plans";
import { currentPeriod } from "@/components/payroll/run-parts";
import type { DeductionPlanKind, PayrollRun } from "@/components/payroll/payroll.types";

// Wording for the loans, advances and recoveries screens, which share one
// set of components.

export type PlanCopy = {
  title: string;
  description: string;
  noun: string;
  plural: string;
  addLabel: string;
  amountLabel: string;
  categoryLabel: string;
  categorySuggestions: string[];
  reasonLabel: string;
  needsApproval: boolean;
  disbursed: boolean;
};

export const PLAN_COPY: Record<DeductionPlanKind, PlanCopy> = {
  Loan: {
    title: "Loan management",
    description:
      "Staff loans, from application and approval to monthly repayment through payroll.",
    noun: "loan",
    plural: "loans",
    addLabel: "New loan",
    amountLabel: "Loan amount",
    categoryLabel: "Loan type",
    categorySuggestions: [
      "Personal loan",
      "Emergency loan",
      "School fees loan",
      "Housing loan",
      "Vehicle loan",
    ],
    reasonLabel: "Purpose",
    needsApproval: true,
    disbursed: true,
  },
  Advance: {
    title: "Advance payments",
    description:
      "Salary advances paid before payday and recovered from the following payrolls.",
    noun: "advance",
    plural: "advances",
    addLabel: "New advance",
    amountLabel: "Advance amount",
    categoryLabel: "",
    categorySuggestions: [],
    reasonLabel: "Reason",
    needsApproval: true,
    disbursed: true,
  },
  Recovery: {
    title: "Payments recovery",
    description:
      "Money owed by employees, such as overpaid salary or lost company property, recovered through payroll.",
    noun: "recovery",
    plural: "recoveries",
    addLabel: "New recovery",
    amountLabel: "Amount to recover",
    categoryLabel: "Recovery type",
    categorySuggestions: [
      "Salary overpayment",
      "Company property",
      "Unreturned advance",
      "Unauthorised expense",
      "Other",
    ],
    reasonLabel: "Details",
    needsApproval: false,
    disbursed: false,
  },
};

const STATUS_CLASSES: Record<PlanDisplayStatus, string> = {
  Pending: "bg-amber-50 text-amber-700 ring-amber-200",
  Active: "bg-blue-50 text-blue-700 ring-blue-200",
  Paused: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  Completed: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  Closed: "bg-zinc-100 text-zinc-600 ring-zinc-200",
  Rejected: "bg-red-50 text-red-700 ring-red-200",
};

export function PlanStatusBadge({ status }: { status: PlanDisplayStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${STATUS_CLASSES[status]}`}
    >
      {status}
    </span>
  );
}

// First month whose payroll can still take a new deduction.
export function firstOpenPeriod(runs: PayrollRun[]) {
  let period = currentPeriod();
  while (runs.some((run) => run.period === period && run.status !== "Draft")) {
    period = addMonths(period, 1);
  }
  return period;
}
