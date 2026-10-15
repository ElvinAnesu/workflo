export const HIRING_REQUEST_STATUSES = [
  "Pending approval",
  "Approved",
  "Rejected",
  "Filled",
  "Cancelled",
] as const;

export type HiringRequestStatus = (typeof HIRING_REQUEST_STATUSES)[number];

export const HIRING_REQUEST_REASONS = ["New position", "Replacement"] as const;

export type HiringRequestReason = (typeof HIRING_REQUEST_REASONS)[number];

export type HiringRequestRow = {
  id: string;
  jobTitle: string;
  department: string;
  branch: string;
  employmentType: string;
  employeeCategory: string;
  positions: number;
  reason: HiringRequestReason;
  justification: string;
  desiredStartDate: string;
  requestedBy: string;
  requestedOn: string;
  status: HiringRequestStatus;
  decisionBy: string;
  decisionOn: string;
  decisionComment: string;
};

export type HiringRequestInput = Pick<
  HiringRequestRow,
  | "jobTitle"
  | "department"
  | "branch"
  | "employmentType"
  | "employeeCategory"
  | "positions"
  | "reason"
  | "justification"
  | "desiredStartDate"
  | "requestedBy"
>;

export const CANDIDATE_STATUSES = [
  "Shortlisted",
  "Selected",
  "Hire confirmed",
  "Converted",
  "Not selected",
] as const;

export type CandidateStatus = (typeof CANDIDATE_STATUSES)[number];

export const CANDIDATE_LIST_STATUSES = CANDIDATE_STATUSES.filter(
  (status) => status !== "Converted",
);

export const CANDIDATE_SOURCES = [
  "Referral",
  "Job board",
  "Walk-in",
  "Agency",
  "Website",
  "Internal",
] as const;

export type CandidateRow = {
  id: string;
  requestId: string;
  firstName: string;
  middleName: string;
  lastName: string;
  email: string;
  phone: string;
  source: string;
  cvFileName: string;
  notes: string;
  addedOn: string;
  status: CandidateStatus;
  startDate: string;
  employeeCode: string;
};

export type CandidateInput = Pick<
  CandidateRow,
  | "requestId"
  | "firstName"
  | "middleName"
  | "lastName"
  | "email"
  | "phone"
  | "source"
  | "cvFileName"
  | "notes"
>;

export type HiringLookupOption = { id: number; name: string };

export type HiringRequestOption = { id: number; label: string };

export type HiringRequestListRow = {
  id: number;
  number: string;
  jobTitle: string;
  departmentId: number;
  departmentName: string;
  branchId: number | null;
  branchName: string;
  employmentTypeId: number | null;
  employmentTypeName: string;
  employeeCategoryId: number | null;
  employeeCategoryName: string;
  positions: number;
  seatsTaken: number;
  candidateCount: number;
  reason: HiringRequestReason;
  justification: string;
  desiredStartDate: string;
  requestedBy: string;
  requestedOn: string;
  status: HiringRequestStatus;
  decisionBy: string;
  decisionOn: string;
  decisionComment: string;
};

export type HiringRequestSaveInput = {
  jobTitle: string;
  departmentId: number | null;
  branchId: number | null;
  employmentTypeId: number | null;
  employeeCategoryId: number | null;
  positions: number | null;
  reason: HiringRequestReason | "";
  justification: string;
  desiredStartDate: string;
  requestedBy: string;
};

export type HiringCandidateListRow = {
  id: number;
  number: string;
  requestId: number;
  requestNumber: string;
  requestLabel: string;
  jobTitle: string;
  requestStatus: HiringRequestStatus;
  positions: number;
  seatsTaken: number;
  desiredStartDate: string;
  departmentId: number;
  branchId: number | null;
  employmentTypeId: number | null;
  employeeCategoryId: number | null;
  firstName: string;
  middleName: string;
  lastName: string;
  name: string;
  email: string;
  phone: string;
  source: string;
  cvFileName: string;
  notes: string;
  addedOn: string;
  status: CandidateStatus;
  startDate: string;
  employeeId: number | null;
  employeeCode: string;
};

export type HiringCandidateSaveInput = {
  requestId: number | null;
  firstName: string;
  middleName: string;
  lastName: string;
  email: string;
  phone: string;
  source: string;
  cvFileName: string;
  notes: string;
};

export type HiringFormOptions = {
  departments: HiringLookupOption[];
  branches: HiringLookupOption[];
  employmentTypes: HiringLookupOption[];
  employeeCategories: HiringLookupOption[];
  approvedRequests: HiringRequestOption[];
  nextEmployeeCode: string;
};

export type HiringListQuery = {
  status: string;
  search: string;
  page: number;
  pageSize: number;
  sortKey: string;
  sortDirection: "asc" | "desc";
};
