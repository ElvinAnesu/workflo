export type LeaveBalanceRow = {
  id: string;
  employeeId: string;
  leaveTypeId: string;
  year: number;
  entitled: number;
};

export type LeaveEmployeeOption = {
  id: number;
  name: string;
  employeeCode: string;
};

export type LeaveBalanceListRow = {
  overrideId: number | null;
  employeeId: number;
  employeeName: string;
  employeeCode: string;
  leaveTypeId: number;
  leaveTypeName: string;
  year: number;
  entitled: number;
  daysPerYear: number;
  taken: number;
  remaining: number;
};

export type LeaveBalanceInput = {
  employeeId: number | null;
  leaveTypeId: number | null;
  year: number | null;
  entitled: number | null;
};
