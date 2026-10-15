export const EMPLOYEE_STATUSES = ["Active", "Inactive", "Terminated"] as const;

export type EmployeeRecord = {
  id: string;
  firstName: string;
  middleName: string;
  lastName: string;
  email: string;
  phoneNumber: string;
  dateOfBirth: string;
  gender: string;
  idNumber: string;
  passportNumber: string;
  maritalStatus: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  employmentType: string;
  employeeCategory: string;
  designation: string;
  department: string;
  branch: string;
  joinDate: string;
  nssfNumber: string;
  officeEmail: string;
  officePhone: string;
  status: string;
};

export type EmployeeRow = EmployeeRecord;

export type EmployeeLookupOption = {
  id: number;
  name: string;
};

export type EmployeeInput = {
  firstName: string;
  middleName: string;
  lastName: string;
  email: string;
  phoneNumber: string;
  dateOfBirth: string;
  gender: string;
  idNumber: string;
  passportNumber: string;
  maritalStatus: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  employmentTypeId: number | null;
  employeeCategoryId: number | null;
  designation: string;
  departmentId: number | null;
  branchId: number | null;
  joinDate: string;
  nssfNumber: string;
  officeEmail: string;
  officePhone: string;
  status: string;
};

export type EmployeeListRow = {
  id: number;
  employeeCode: string;
  firstName: string;
  middleName: string;
  lastName: string;
  email: string;
  phoneNumber: string;
  dateOfBirth: string;
  gender: string;
  idNumber: string;
  passportNumber: string;
  maritalStatus: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  employmentTypeId: number | null;
  employmentTypeName: string;
  employeeCategoryId: number | null;
  employeeCategoryName: string;
  designation: string;
  departmentId: number | null;
  departmentName: string;
  branchId: number | null;
  branchName: string;
  joinDate: string;
  nssfNumber: string;
  officeEmail: string;
  officePhone: string;
  status: string;
};

export type EmployeeImportRecord = {
  firstName: string;
  middleName: string;
  lastName: string;
  email: string;
  phoneNumber: string;
  designation: string;
  department: string;
  branch: string;
  employmentType: string;
  employeeCategory: string;
  joinDate: string;
  status: string;
};
