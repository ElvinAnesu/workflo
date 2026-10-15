export type TimetablePattern = "weekly" | "date";

export const WEEKDAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

export type TimetableRow = {
  id: string;
  shiftId: string;
  pattern: TimetablePattern;
  weekdays: string[];
  date: string;
  employeeIds: string[];
};

export type TimetableShiftOption = {
  id: number;
  label: string;
};

export type TimetableEmployeeOption = {
  id: number;
  name: string;
  employeeCode: string;
};

export type TimetableDepartmentOption = {
  id: number;
  name: string;
};

export type TimetableEmployeeChoice = {
  id: number;
  name: string;
  employeeCode: string;
  departmentId: number | null;
  departmentName: string;
};

export type TimetableEmployeeFilter = {
  filter: "all" | "none" | "department";
  departmentId: number | null;
  includeIds: number[];
  search: string;
};

export type TimetableInput = {
  name: string;
  shiftId: number | null;
  pattern: TimetablePattern | "";
  weekdays: string[];
  workDate: string;
  employeeIds: number[];
};

export type TimetableListRow = {
  id: number;
  name: string;
  shiftId: number;
  shiftName: string;
  branchName: string;
  departmentName: string;
  pattern: TimetablePattern;
  weekdays: string[];
  workDate: string;
  employees: TimetableEmployeeOption[];
};
