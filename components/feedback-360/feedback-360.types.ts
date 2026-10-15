export const RATER_GROUPS = [
  "Self",
  "Manager",
  "Peer",
  "Direct report",
  "Other",
] as const;

export type RaterGroup = (typeof RATER_GROUPS)[number];

export type FeedbackReviewStatus = "Collecting" | "Closed";

export type FeedbackReview = {
  id: string;
  token: string;
  employeeName: string;
  jobTitle: string;
  department: string;
  dueDate: string;
  competencyKeys: string[];
  anonymityThreshold: number;
  message: string;
  status: FeedbackReviewStatus;
  createdOn: string;
};

export type FeedbackReviewInput = Pick<
  FeedbackReview,
  | "employeeName"
  | "jobTitle"
  | "department"
  | "dueDate"
  | "competencyKeys"
  | "anonymityThreshold"
  | "message"
>;

// A rating of null means "Not able to rate".
export type FeedbackResponse = {
  id: string;
  reviewId: string;
  group: RaterGroup;
  ratings: Record<string, number | null>;
  comments: Record<string, string>;
  submittedOn: string;
};

export type FeedbackResponseInput = Pick<
  FeedbackResponse,
  "group" | "ratings" | "comments"
>;
