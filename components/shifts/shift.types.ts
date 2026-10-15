export type ShiftRow = {
  id: string;
  shiftName: string;
  branchId: string;
  departmentId: string;
  startTime: string;
  endTime: string;
};

export type ShiftLookupOption = {
  id: number;
  name: string;
};

export type ShiftInput = {
  name: string;
  branchId: number | null;
  departmentId: number | null;
  startTime: string;
  endTime: string;
};

export type ShiftListRow = {
  id: number;
  shiftName: string;
  branchId: number;
  branchName: string;
  departmentId: number | null;
  departmentName: string;
  startTime: string;
  endTime: string;
};
