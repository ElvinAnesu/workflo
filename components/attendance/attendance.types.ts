export const ATTENDANCE_STATUSES = [
  "Present",
  "Absent",
  "Late",
  "Half day",
  "Off",
  "On leave",
] as const;

export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export type AttendanceRow = {
  id: string;
  date: string;
  employeeId: string;
  shiftId: string;
  status: AttendanceStatus;
};

export type AttendanceShiftOption = {
  id: number;
  name: string;
  markLabel: string;
};

export type AttendanceEmployeeOption = {
  id: number;
  name: string;
  employeeCode: string;
};

export type MarkAttendanceRow = {
  employeeId: number;
  employeeName: string;
  employeeCode: string;
  status: AttendanceStatus | "";
};

export type MarkAttendanceSaveRow = {
  employeeId: number;
  status: AttendanceStatus | "";
};

export type AttendanceListRow = {
  id: number;
  workDate: string;
  employeeId: number;
  employeeName: string;
  employeeCode: string;
  shiftId: number;
  shiftName: string;
  branchName: string;
  departmentName: string;
  status: AttendanceStatus;
};

export type AttendanceInput = {
  workDate: string;
  employeeId: number | null;
  shiftId: number | null;
  status: AttendanceStatus | "";
};
