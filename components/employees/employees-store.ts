"use client";

import type { EmployeeRecord } from "@/components/employees/employee.types";
import {
  createPersistentStore,
  prefixedId,
} from "@/components/store/persistent-store";

type EmployeesState = {
  employees: EmployeeRecord[];
};

const store = createPersistentStore<EmployeesState>("workflo.employees.v1", {
  employees: [],
});

export const useEmployeesState = store.useStore;

export function employeeName(employee: Pick<EmployeeRecord, "firstName" | "middleName" | "lastName">) {
  return [employee.firstName, employee.middleName, employee.lastName]
    .filter(Boolean)
    .join(" ");
}

export function nextEmployeeCode() {
  return prefixedId(
    "EMP",
    store.getState().employees.map((employee) => employee.id),
  );
}

export function saveEmployee(record: EmployeeRecord) {
  store.setState((current) => {
    const exists = current.employees.some((item) => item.id === record.id);
    return {
      employees: exists
        ? current.employees.map((item) =>
            item.id === record.id ? record : item,
          )
        : [...current.employees, record],
    };
  });
}

// Employees reference branches, departments, categories and employment types
// by name; keep them in step when a lookup is renamed.
export type EmployeeLookupField =
  | "branch"
  | "department"
  | "employeeCategory"
  | "employmentType";

export function renameEmployeeLookup(
  field: EmployeeLookupField,
  from: string,
  to: string,
) {
  if (from === to) {
    return;
  }
  store.setState((current) => ({
    employees: current.employees.map((employee) =>
      employee[field] === from ? { ...employee, [field]: to } : employee,
    ),
  }));
}

export function countEmployeesWith(field: EmployeeLookupField, value: string) {
  return store
    .getState()
    .employees.filter((employee) => employee[field] === value).length;
}

export function getEmployees() {
  return store.getState().employees;
}

export function deleteEmployee(id: string) {
  store.setState((current) => ({
    employees: current.employees.filter((employee) => employee.id !== id),
  }));
}

export function addEmployees(records: EmployeeRecord[]) {
  store.setState((current) => ({
    employees: [...current.employees, ...records],
  }));
}
