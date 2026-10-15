export type AppraisalCycleRow = {
  id: string;
  cycleName: string;
  startDate: string;
  endDate: string;
  status: "Open" | "Closed";
};
