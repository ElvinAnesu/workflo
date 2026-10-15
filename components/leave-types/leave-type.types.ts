export type LeaveTypeRow = {
  id: string;
  leaveTypeName: string;
  daysPerYear: number;
  paidUnpaid: "Paid" | "Unpaid";
  appliesTo: "Everyone" | "Assign as needed";
};

export type LeavePaidUnpaid = LeaveTypeRow["paidUnpaid"];
export type LeaveAppliesTo = LeaveTypeRow["appliesTo"];

export type LeaveTypeListRow = {
  id: number;
  name: string;
  daysPerYear: number;
  paidUnpaid: LeavePaidUnpaid;
  appliesTo: LeaveAppliesTo;
  employeeIds: number[];
};

export type LeaveTypeInput = {
  name: string;
  daysPerYear: number | null;
  paidUnpaid: LeavePaidUnpaid | "";
  appliesTo: LeaveAppliesTo | "";
  employeeIds: number[];
};

export type LeaveDepartmentOption = {
  id: number;
  name: string;
};

export type LeaveEmployeeChoice = {
  id: number;
  name: string;
  employeeCode: string;
  departmentId: number | null;
  departmentName: string;
};

export type LeaveEmployeeFilter = {
  filter: "all" | "none" | "department";
  departmentId: number | null;
  includeIds: number[];
  search: string;
};

export type LeaveTypeOption = LeaveTypeListRow;
