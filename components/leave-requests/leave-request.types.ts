export const LEAVE_REQUEST_STATUSES = ["Pending", "Approved", "Rejected"] as const;

export type LeaveRequestStatus = (typeof LEAVE_REQUEST_STATUSES)[number];

export type LeaveRequestRow = {
  id: string;
  employeeId: string;
  leaveTypeId: string;
  startDate: string;
  endDate: string;
  days: number;
  note: string;
  status: LeaveRequestStatus;
  decidedBy: string;
  decidedOn: string;
};

export type LeaveRequestListRow = {
  id: number;
  employeeId: number;
  employeeName: string;
  employeeCode: string;
  leaveTypeId: number;
  leaveTypeName: string;
  startDate: string;
  endDate: string;
  days: number;
  note: string;
  status: LeaveRequestStatus;
  decidedByName: string;
  decidedOn: string;
};

export type LeaveRequestInput = {
  employeeId: number | null;
  leaveTypeId: number | null;
  startDate: string;
  endDate: string;
  note: string;
};
