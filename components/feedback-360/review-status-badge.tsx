import type { FeedbackReviewStatus } from "@/components/feedback-360/feedback-360.types";

const STATUS_CLASSES: Record<FeedbackReviewStatus, string> = {
  Collecting: "bg-blue-50 text-blue-700 ring-blue-200",
  Closed: "bg-zinc-100 text-zinc-600 ring-zinc-200",
};

export function ReviewStatusBadge({ status }: { status: FeedbackReviewStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${STATUS_CLASSES[status]}`}
    >
      {status}
    </span>
  );
}
