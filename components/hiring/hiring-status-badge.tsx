import type {
  CandidateStatus,
  HiringRequestStatus,
} from "@/components/hiring/hiring.types";

const STATUS_CLASSES: Record<HiringRequestStatus | CandidateStatus, string> = {
  "Pending approval": "bg-amber-50 text-amber-700 ring-amber-200",
  Approved: "bg-blue-50 text-blue-700 ring-blue-200",
  Rejected: "bg-red-50 text-red-700 ring-red-200",
  Filled: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  Cancelled: "bg-zinc-100 text-zinc-600 ring-zinc-200",
  Shortlisted: "bg-zinc-100 text-zinc-700 ring-zinc-200",
  Selected: "bg-blue-50 text-blue-700 ring-blue-200",
  "Hire confirmed": "bg-indigo-50 text-indigo-700 ring-indigo-200",
  Converted: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  "Not selected": "bg-red-50 text-red-700 ring-red-200",
};

type HiringStatusBadgeProps = {
  status: HiringRequestStatus | CandidateStatus;
};

export function HiringStatusBadge({ status }: HiringStatusBadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${STATUS_CLASSES[status]}`}
    >
      {status}
    </span>
  );
}
