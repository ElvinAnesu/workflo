export const APPRAISAL_RATINGS = ["Outstanding", "Meets", "Below", "Unrated"] as const;

export type AppraisalRow = {
  id: string;
  employeeId: string;
  cycleId: string;
  overallRating: (typeof APPRAISAL_RATINGS)[number];
  comments: string;
  status: "Draft" | "Completed";
};
