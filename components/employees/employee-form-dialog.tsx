"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { X } from "lucide-react";
import {
  formControlClass,
  formControlDisabledClass,
} from "@/components/form/form-control";
import { FormSectionStrip } from "@/components/form/form-section-strip";
import { LookupSelect } from "@/components/hr/lookup-select";
import {
  EMPLOYEE_STATUSES,
  type EmployeeRecord,
} from "@/components/employees/employee.types";
import {
  nextEmployeeCode,
  saveEmployee,
} from "@/components/employees/employees-store";

type EmployeeFormDialogProps = {
  employee?: EmployeeRecord | null;
  initialValues?: Partial<EmployeeFormState>;
  onSaved?: (values: EmployeeFormState) => void;
  onClose: () => void;
};

export type EmployeeFormState = {
  firstName: string;
  middleName: string;
  lastName: string;
  employeeCode: string;
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

const emptyForm: EmployeeFormState = {
  firstName: "",
  middleName: "",
  lastName: "",
  employeeCode: "",
  email: "",
  phoneNumber: "",
  dateOfBirth: "",
  gender: "",
  idNumber: "",
  passportNumber: "",
  maritalStatus: "",
  emergencyContactName: "",
  emergencyContactPhone: "",
  employmentType: "",
  employeeCategory: "",
  designation: "",
  department: "",
  branch: "",
  joinDate: "",
  nssfNumber: "",
  officeEmail: "",
  officePhone: "",
  status: "",
};

const fieldClass = formControlClass;
const disabledFieldClass = formControlDisabledClass;
const sectionGridClass =
  "grid grid-cols-1 gap-2 p-4 sm:grid-cols-4";

function createForm(
  employee?: EmployeeRecord | null,
  initialValues?: Partial<EmployeeFormState>,
): EmployeeFormState {
  if (employee) {
    const { id, ...rest } = employee;
    return { ...emptyForm, ...rest, employeeCode: id };
  }

  return {
    ...emptyForm,
    status: "Active",
    ...initialValues,
    employeeCode: nextEmployeeCode(),
  };
}

function FormField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs text-zinc-600">
      {label}
      {children}
    </label>
  );
}

export function EmployeeFormDialog({
  employee,
  initialValues,
  onSaved,
  onClose,
}: EmployeeFormDialogProps) {
  const isUpdate = Boolean(employee);
  const [form, setForm] = useState<EmployeeFormState>(() =>
    createForm(employee, initialValues),
  );

  function updateField(key: keyof EmployeeFormState, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const { employeeCode, ...rest } = form;
    saveEmployee({ ...rest, id: employeeCode });
    onSaved?.(form);
    onClose();
  }

  return (
    <form onSubmit={handleSubmit} className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
        <h2 className="text-base font-semibold text-zinc-800">
          {isUpdate ? "Update employee" : "Add employee"}
        </h2>
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="inline-flex size-8 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-100"
        >
          <X className="size-4" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <FormSectionStrip title="Personal details" />
        <div className={sectionGridClass}>
          <FormField label="First name">
            <input
              required
              value={form.firstName}
              onChange={(event) => updateField("firstName", event.target.value)}
              className={fieldClass}
            />
          </FormField>
          <FormField label="Middle name">
            <input
              value={form.middleName}
              onChange={(event) =>
                updateField("middleName", event.target.value)
              }
              className={fieldClass}
            />
          </FormField>
          <FormField label="Last name">
            <input
              required
              value={form.lastName}
              onChange={(event) => updateField("lastName", event.target.value)}
              className={fieldClass}
            />
          </FormField>
          <FormField label="Email">
            <input
              type="email"
              value={form.email}
              onChange={(event) => updateField("email", event.target.value)}
              className={fieldClass}
            />
          </FormField>
          <FormField label="Phone number">
            <input
              type="tel"
              value={form.phoneNumber}
              onChange={(event) =>
                updateField("phoneNumber", event.target.value)
              }
              className={fieldClass}
            />
          </FormField>
          <FormField label="Date of birth">
            <input
              type="date"
              value={form.dateOfBirth}
              onChange={(event) =>
                updateField("dateOfBirth", event.target.value)
              }
              className={fieldClass}
            />
          </FormField>
          <FormField label="Gender">
            <select
              value={form.gender}
              onChange={(event) => updateField("gender", event.target.value)}
              className={fieldClass}
            >
              <option value="">Select</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
            </select>
          </FormField>
          <FormField label="ID number">
            <input
              value={form.idNumber}
              onChange={(event) => updateField("idNumber", event.target.value)}
              className={fieldClass}
            />
          </FormField>
          <FormField label="Passport number">
            <input
              value={form.passportNumber}
              onChange={(event) =>
                updateField("passportNumber", event.target.value)
              }
              className={fieldClass}
            />
          </FormField>
          <FormField label="Marital Status">
            <input
              value={form.maritalStatus}
              onChange={(event) =>
                updateField("maritalStatus", event.target.value)
              }
              className={fieldClass}
            />
          </FormField>
          <FormField label="Emergency contact name">
            <input
              value={form.emergencyContactName}
              onChange={(event) =>
                updateField("emergencyContactName", event.target.value)
              }
              className={fieldClass}
            />
          </FormField>
          <FormField label="Emergency contact phone">
            <input
              type="tel"
              value={form.emergencyContactPhone}
              onChange={(event) =>
                updateField("emergencyContactPhone", event.target.value)
              }
              className={fieldClass}
            />
          </FormField>
        </div>
        <FormSectionStrip title="Employment details" />
        <div className={sectionGridClass}>
          <FormField label="Employee code">
            <input
              value={form.employeeCode}
              disabled
              className={disabledFieldClass}
            />
          </FormField>
          <FormField label="Employment type">
            <LookupSelect
              collection="employmentTypes"
              value={form.employmentType}
              onChange={(value) => updateField("employmentType", value)}
            />
          </FormField>
          <FormField label="Employee category">
            <LookupSelect
              collection="employeeCategories"
              value={form.employeeCategory}
              onChange={(value) => updateField("employeeCategory", value)}
            />
          </FormField>
          <FormField label="Designation">
            <input
              value={form.designation}
              onChange={(event) =>
                updateField("designation", event.target.value)
              }
              className={fieldClass}
            />
          </FormField>
          <FormField label="Department">
            <LookupSelect
              collection="departments"
              value={form.department}
              onChange={(value) => updateField("department", value)}
            />
          </FormField>
          <FormField label="Branch">
            <LookupSelect
              collection="branches"
              value={form.branch}
              onChange={(value) => updateField("branch", value)}
            />
          </FormField>
          <FormField label="Join date">
            <input
              type="date"
              value={form.joinDate}
              onChange={(event) => updateField("joinDate", event.target.value)}
              className={fieldClass}
            />
          </FormField>
          <FormField label="NSSF number">
            <input
              value={form.nssfNumber}
              onChange={(event) =>
                updateField("nssfNumber", event.target.value)
              }
              className={fieldClass}
            />
          </FormField>
          <FormField label="Office email">
            <input
              type="email"
              value={form.officeEmail}
              onChange={(event) =>
                updateField("officeEmail", event.target.value)
              }
              className={fieldClass}
            />
          </FormField>
          <FormField label="Office phone">
            <input
              type="tel"
              value={form.officePhone}
              onChange={(event) =>
                updateField("officePhone", event.target.value)
              }
              className={fieldClass}
            />
          </FormField>
        </div>
        <FormSectionStrip title="General information" />
        <div className={sectionGridClass}>
          <FormField label="Status">
            <select
              value={form.status}
              onChange={(event) => updateField("status", event.target.value)}
              className={fieldClass}
            >
              {EMPLOYEE_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </FormField>
        </div>
      </div>
      <div className="flex justify-end gap-2 border-t border-zinc-200 px-4 py-3">
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-9 items-center rounded-md border border-zinc-200 bg-white px-3 text-sm font-medium text-zinc-700"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="inline-flex h-9 items-center rounded-md bg-[#172554] px-3 text-sm font-medium text-white"
        >
          {isUpdate ? "Save" : "Add"}
        </button>
      </div>
    </form>
  );
}
