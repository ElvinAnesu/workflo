"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import {
  createEmployeeAction,
  updateEmployeeAction,
} from "@/app/(app)/employees/actions";
import { useConfirmDialog } from "@/components/dialog/confirm-dialog-provider";
import {
  EMPLOYEE_STATUSES,
  type EmployeeInput,
  type EmployeeListRow,
  type EmployeeLookupOption,
} from "@/components/employees/employee.types";
import { FormSectionStrip } from "@/components/form/form-section-strip";
import {
  formControlClass,
  formControlDisabledClass,
} from "@/components/form/form-control";

type EmployeeRecordDialogProps = {
  employee?: EmployeeListRow | null;
  nextCode: string;
  branches: EmployeeLookupOption[];
  departments: EmployeeLookupOption[];
  employmentTypes: EmployeeLookupOption[];
  employeeCategories: EmployeeLookupOption[];
  initialValues?: Partial<FormState>;
  onCreated?: (created: { id: number; employeeCode: string }) => Promise<{ error: string } | void>;
  onClose: () => void;
};

type FormState = {
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
  employmentTypeId: string;
  employeeCategoryId: string;
  designation: string;
  departmentId: string;
  branchId: string;
  joinDate: string;
  nssfNumber: string;
  officeEmail: string;
  officePhone: string;
  status: string;
};

const fieldClass = formControlClass;
const disabledFieldClass = formControlDisabledClass;
const sectionGridClass = "grid grid-cols-1 gap-2 p-4 sm:grid-cols-4";

function idValue(id: number | null) {
  return id ? String(id) : "";
}

function withCurrent(
  options: EmployeeLookupOption[],
  id: number | null,
  name: string,
) {
  if (id && !options.some((option) => option.id === id)) {
    return [...options, { id, name: name || String(id) }];
  }
  return options;
}

function toId(value: string) {
  if (!value) {
    return null;
  }
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
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

function LookupField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: EmployeeLookupOption[];
  onChange: (value: string) => void;
}) {
  return (
    <FormField label={label}>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={fieldClass}
      >
        <option value="">Select</option>
        {options.map((option) => (
          <option key={option.id} value={String(option.id)}>
            {option.name}
          </option>
        ))}
      </select>
    </FormField>
  );
}

export function EmployeeRecordDialog({
  employee,
  nextCode,
  branches,
  departments,
  employmentTypes,
  employeeCategories,
  initialValues,
  onCreated,
  onClose,
}: EmployeeRecordDialogProps) {
  const isUpdate = Boolean(employee);
  const router = useRouter();
  const { confirm } = useConfirmDialog();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [form, setForm] = useState<FormState>(() =>
    employee
      ? {
          firstName: employee.firstName,
          middleName: employee.middleName,
          lastName: employee.lastName,
          employeeCode: employee.employeeCode,
          email: employee.email,
          phoneNumber: employee.phoneNumber,
          dateOfBirth: employee.dateOfBirth,
          gender: employee.gender,
          idNumber: employee.idNumber,
          passportNumber: employee.passportNumber,
          maritalStatus: employee.maritalStatus,
          emergencyContactName: employee.emergencyContactName,
          emergencyContactPhone: employee.emergencyContactPhone,
          employmentTypeId: idValue(employee.employmentTypeId),
          employeeCategoryId: idValue(employee.employeeCategoryId),
          designation: employee.designation,
          departmentId: idValue(employee.departmentId),
          branchId: idValue(employee.branchId),
          joinDate: employee.joinDate,
          nssfNumber: employee.nssfNumber,
          officeEmail: employee.officeEmail,
          officePhone: employee.officePhone,
          status: employee.status || "Active",
        }
      : {
          firstName: initialValues?.firstName ?? "",
          middleName: initialValues?.middleName ?? "",
          lastName: initialValues?.lastName ?? "",
          employeeCode: nextCode,
          email: initialValues?.email ?? "",
          phoneNumber: initialValues?.phoneNumber ?? "",
          dateOfBirth: initialValues?.dateOfBirth ?? "",
          gender: initialValues?.gender ?? "",
          idNumber: initialValues?.idNumber ?? "",
          passportNumber: initialValues?.passportNumber ?? "",
          maritalStatus: initialValues?.maritalStatus ?? "",
          emergencyContactName: initialValues?.emergencyContactName ?? "",
          emergencyContactPhone: initialValues?.emergencyContactPhone ?? "",
          employmentTypeId: initialValues?.employmentTypeId ?? "",
          employeeCategoryId: initialValues?.employeeCategoryId ?? "",
          designation: initialValues?.designation ?? "",
          departmentId: initialValues?.departmentId ?? "",
          branchId: initialValues?.branchId ?? "",
          joinDate: initialValues?.joinDate ?? "",
          nssfNumber: initialValues?.nssfNumber ?? "",
          officeEmail: initialValues?.officeEmail ?? "",
          officePhone: initialValues?.officePhone ?? "",
          status: initialValues?.status || "Active",
        },
  );

  function updateField(key: keyof FormState, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit() {
    if (!form.firstName.trim()) {
      setError("First name is required.");
      return;
    }
    if (!form.lastName.trim()) {
      setError("Last name is required.");
      return;
    }

    const ok = await confirm({
      title: isUpdate ? "Update employee" : "Create employee",
      message: isUpdate
        ? `Save changes to ${form.firstName.trim()} ${form.lastName.trim()}?`
        : `Create ${form.firstName.trim()} ${form.lastName.trim()}?`,
      confirmLabel: isUpdate ? "Save" : "Create",
    });
    if (!ok) {
      return;
    }

    const input: EmployeeInput = {
      firstName: form.firstName,
      middleName: form.middleName,
      lastName: form.lastName,
      email: form.email,
      phoneNumber: form.phoneNumber,
      dateOfBirth: form.dateOfBirth,
      gender: form.gender,
      idNumber: form.idNumber,
      passportNumber: form.passportNumber,
      maritalStatus: form.maritalStatus,
      emergencyContactName: form.emergencyContactName,
      emergencyContactPhone: form.emergencyContactPhone,
      employmentTypeId: toId(form.employmentTypeId),
      employeeCategoryId: toId(form.employeeCategoryId),
      designation: form.designation,
      departmentId: toId(form.departmentId),
      branchId: toId(form.branchId),
      joinDate: form.joinDate,
      nssfNumber: form.nssfNumber,
      officeEmail: form.officeEmail,
      officePhone: form.officePhone,
      status: form.status,
    };

    setPending(true);
    setError("");
    if (employee) {
      const result = await updateEmployeeAction(employee.id, input);
      setPending(false);
      if ("error" in result && result.error) {
        setError(result.error);
        return;
      }
    } else {
      const result = await createEmployeeAction(input);
      setPending(false);
      if (!("id" in result) || !result.id || !result.employeeCode) {
        setError("error" in result && result.error ? result.error : "Employee could not be created.");
        return;
      }
      if (onCreated) {
        const marked = await onCreated({ id: result.id, employeeCode: result.employeeCode });
        if (marked?.error) {
          setError(marked.error);
          return;
        }
      }
    }

    router.refresh();
    onClose();
  }

  const branchOptions = withCurrent(
    branches,
    employee?.branchId ?? null,
    employee?.branchName ?? "",
  );
  const departmentOptions = withCurrent(
    departments,
    employee?.departmentId ?? null,
    employee?.departmentName ?? "",
  );

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void handleSubmit();
      }}
      className="flex h-full min-h-0 flex-col"
    >
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
              onChange={(event) => updateField("middleName", event.target.value)}
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
              onChange={(event) => updateField("phoneNumber", event.target.value)}
              className={fieldClass}
            />
          </FormField>
          <FormField label="Date of birth">
            <input
              type="date"
              value={form.dateOfBirth}
              onChange={(event) => updateField("dateOfBirth", event.target.value)}
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
              onChange={(event) => updateField("passportNumber", event.target.value)}
              className={fieldClass}
            />
          </FormField>
          <FormField label="Marital Status">
            <input
              value={form.maritalStatus}
              onChange={(event) => updateField("maritalStatus", event.target.value)}
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
          <LookupField
            label="Employment type"
            value={form.employmentTypeId}
            options={employmentTypes}
            onChange={(value) => updateField("employmentTypeId", value)}
          />
          <LookupField
            label="Employee category"
            value={form.employeeCategoryId}
            options={employeeCategories}
            onChange={(value) => updateField("employeeCategoryId", value)}
          />
          <FormField label="Designation">
            <input
              value={form.designation}
              onChange={(event) => updateField("designation", event.target.value)}
              className={fieldClass}
            />
          </FormField>
          <LookupField
            label="Department"
            value={form.departmentId}
            options={departmentOptions}
            onChange={(value) => updateField("departmentId", value)}
          />
          <LookupField
            label="Branch"
            value={form.branchId}
            options={branchOptions}
            onChange={(value) => updateField("branchId", value)}
          />
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
              onChange={(event) => updateField("nssfNumber", event.target.value)}
              className={fieldClass}
            />
          </FormField>
          <FormField label="Office email">
            <input
              type="email"
              value={form.officeEmail}
              onChange={(event) => updateField("officeEmail", event.target.value)}
              className={fieldClass}
            />
          </FormField>
          <FormField label="Office phone">
            <input
              type="tel"
              value={form.officePhone}
              onChange={(event) => updateField("officePhone", event.target.value)}
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
      <div className="flex items-center justify-end gap-2 border-t border-zinc-200 px-4 py-3">
        {error ? <p className="mr-auto text-xs text-red-600">{error}</p> : null}
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-9 items-center rounded-md border border-zinc-200 bg-white px-3 text-sm font-medium text-zinc-700"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-9 items-center rounded-md bg-[#172554] px-3 text-sm font-medium text-white disabled:opacity-40"
        >
          {pending ? "Saving…" : isUpdate ? "Save" : "Add"}
        </button>
      </div>
    </form>
  );
}
