"use client";

import Link from "next/link";
import { formControlClass } from "@/components/form/form-control";
import {
  lookupNames,
  useHrState,
  type EmployeeLookupCollection,
} from "@/components/hr/hr-store";

const SETUP_LINKS: Record<EmployeeLookupCollection, string> = {
  branches: "/branches",
  departments: "/departments",
  employeeCategories: "/employee-categories",
  employmentTypes: "/employment-types",
};

type LookupSelectProps = {
  collection: EmployeeLookupCollection;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  className?: string;
};

// Dropdown of a lookup's names. A saved value that no longer exists in the
// lookup (renamed elsewhere, imported data) is still shown so it is not lost.
export function LookupSelect({
  collection,
  value,
  onChange,
  required,
  className,
}: LookupSelectProps) {
  const state = useHrState();
  const names = lookupNames(state, collection);
  const options = value && !names.includes(value) ? [value, ...names] : names;

  return (
    <>
      <select
        required={required}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={className ?? formControlClass}
      >
        <option value="">Select</option>
        {options.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </select>
      {names.length === 0 ? (
        <Link href={SETUP_LINKS[collection]} className="text-[11px] text-[#1E40AF]">
          None set up yet. Add them first
        </Link>
      ) : null}
    </>
  );
}
