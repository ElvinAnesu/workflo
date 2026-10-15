"use client";

import { Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  deleteComponentAction,
  saveComponentAction,
} from "@/app/(app)/settings/payroll-actions";
import { useOverlayDialog } from "@/components/dialog/overlay-dialog-provider";
import {
  CheckboxField,
  dangerLinkButtonClass,
  FormDialogFrame,
  FormField,
  linkButtonClass,
  primaryButtonClass,
  sectionGridClass,
} from "@/components/form/form-dialog-frame";
import { formControlClass } from "@/components/form/form-control";
import { nextSort, payrollQuery } from "@/components/payroll/list-query";
import { formatMoney, parseAmount } from "@/components/payroll/payroll-format";
import {
  PAY_COMPONENT_CALCULATIONS,
  PAY_COMPONENT_TYPES,
  type PayComponentCalculation,
  type PayComponentListRow,
  type PayComponentType,
} from "@/components/payroll/payroll.types";
import { DataTable } from "@/components/table/data-table";
import { RowActions } from "@/components/table/table-actions";
import type { DataTableColumn, DataTableSort } from "@/components/table/data-table.types";

const invalidClass = "h-7 rounded-md border border-red-500 bg-red-50 px-2 text-xs text-zinc-700 outline-none";

function describeValue(component: PayComponentListRow) {
  return component.calculation === "% of basic salary"
    ? `${component.defaultValue}% of basic`
    : formatMoney(component.defaultValue);
}

function PayComponentDialog({
  component,
  onClose,
}: {
  component: PayComponentListRow | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [form, setForm] = useState({
    code: component?.code ?? "",
    name: component?.name ?? "",
    type: component?.type ?? ("Earning" as PayComponentType),
    calculation: component?.calculation ?? ("Fixed amount" as PayComponentCalculation),
    defaultValue: component ? String(component.defaultValue) : "",
    taxable: component?.taxable ?? true,
    active: component?.active ?? true,
  });
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit() {
    setSubmitted(true);
    const code = form.code.trim().toUpperCase();
    const value = parseAmount(form.defaultValue || "0");

    if (!code || !form.name.trim()) {
      setError("Code and name are required.");
      return;
    }
    if (!Number.isFinite(value) || value < 0) {
      setError("Default value must be a number of 0 or more.");
      return;
    }
    if (form.calculation === "% of basic salary" && value > 100) {
      setError("A percentage cannot be more than 100.");
      return;
    }

    const result = await saveComponentAction({
      id: component ? Number(component.id) : undefined,
      code,
      name: form.name.trim(),
      type: form.type,
      calculation: form.calculation,
      defaultValue: value,
      taxable: form.type === "Earning" ? form.taxable : false,
      active: form.active,
    });
    if ("error" in result && result.error) {
      setError(result.error);
      return;
    }
    onClose();
    router.refresh();
  }

  return (
    <FormDialogFrame
      title={component ? "Update pay component" : "Add pay component"}
      submitLabel={component ? "Save" : "Add"}
      onSubmit={() => {
        void handleSubmit();
      }}
      onClose={onClose}
      error={error}
    >
      <div className={sectionGridClass}>
        <FormField label="Code" hint="Short code shown on payslips, e.g. HSE">
          <input
            value={form.code}
            onChange={(event) => setForm({ ...form, code: event.target.value })}
            className={`${submitted && !form.code.trim() ? invalidClass : formControlClass} uppercase`}
          />
        </FormField>
        <FormField label="Name">
          <input
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
            className={submitted && !form.name.trim() ? invalidClass : formControlClass}
          />
        </FormField>
        <FormField label="Type">
          <select
            value={form.type}
            onChange={(event) => setForm({ ...form, type: event.target.value as PayComponentType })}
            className={formControlClass}
          >
            {PAY_COMPONENT_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Calculation">
          <select
            value={form.calculation}
            onChange={(event) =>
              setForm({
                ...form,
                calculation: event.target.value as PayComponentCalculation,
              })
            }
            className={formControlClass}
          >
            {PAY_COMPONENT_CALCULATIONS.map((calculation) => (
              <option key={calculation} value={calculation}>
                {calculation}
              </option>
            ))}
          </select>
        </FormField>
        <FormField
          label={form.calculation === "% of basic salary" ? "Default percentage" : "Default amount"}
          hint="Can be changed per employee in Component assignment"
        >
          <input
            inputMode="decimal"
            value={form.defaultValue}
            onChange={(event) => setForm({ ...form, defaultValue: event.target.value })}
            className={formControlClass}
          />
        </FormField>
        <div className="flex flex-col justify-end gap-2 sm:col-span-3">
          {form.type === "Earning" ? (
            <CheckboxField
              label="Taxable"
              hint="Included in income for PAYE"
              checked={form.taxable}
              onChange={(taxable) => setForm({ ...form, taxable })}
            />
          ) : null}
          <CheckboxField
            label="Active"
            hint="Inactive components are ignored in payroll runs"
            checked={form.active}
            onChange={(active) => setForm({ ...form, active })}
          />
        </div>
      </div>
    </FormDialogFrame>
  );
}

export function PayComponentsPage({
  rows,
  totalCount,
  search,
  page,
  pageSize,
  sort,
}: {
  rows: PayComponentListRow[];
  totalCount: number;
  search: string;
  page: number;
  pageSize: number;
  sort: DataTableSort;
}) {
  const overlay = useOverlayDialog();
  const router = useRouter();
  const pathname = usePathname();

  function replaceQuery(next: { search?: string; page?: number; pageSize?: number; sort?: DataTableSort }) {
    router.push(
      `${pathname}${payrollQuery({
        search: next.search ?? search,
        page: next.page ?? page,
        pageSize: next.pageSize ?? pageSize,
        sort: next.sort ?? sort,
      })}`,
    );
  }

  const columns = useMemo<DataTableColumn<PayComponentListRow>[]>(
    () => [
      { key: "code", label: "Code" },
      { key: "name", label: "Name" },
      { key: "type", label: "Type" },
      { key: "calculation", label: "Calculation" },
      {
        key: "defaultValue",
        label: "Default",
        render: (row) => describeValue(row),
      },
      {
        key: "taxable",
        label: "Taxable",
        render: (row) => (row.type === "Earning" ? (row.taxable ? "Yes" : "No") : "—"),
      },
      {
        key: "assigned",
        label: "Employees",
        sortable: false,
        render: (row) => row.assignmentCount,
      },
      {
        key: "active",
        label: "Status",
        render: (row) => (row.active ? "Active" : "Inactive"),
      },
      {
        key: "actions",
        label: "Actions",
        sortable: false,
        render: (row) => (
          <RowActions>
            <button
              type="button"
              onClick={() =>
                overlay.show(
                  <PayComponentDialog key={`edit-${row.id}`} component={row} onClose={overlay.close} />,
                )
              }
              className={linkButtonClass}
            >
              Edit
            </button>
            <button
              type="button"
              onClick={() => {
                if (
                  window.confirm(
                    `Delete ${row.name}? It will be removed from every employee it is assigned to. Payrolls already calculated are not affected.`,
                  )
                ) {
                  void deleteComponentAction(Number(row.id)).then((result) => {
                    if ("error" in result && result.error) {
                      window.alert(result.error);
                      return;
                    }
                    router.refresh();
                  });
                }
              }}
              className={dangerLinkButtonClass}
            >
              Delete
            </button>
          </RowActions>
        ),
      },
    ],
    [overlay, router],
  );

  return (
    <DataTable
      columns={columns}
      rows={rows}
      totalCount={totalCount}
      page={page}
      pageSize={pageSize}
      search={search}
      sort={sort}
      onSearch={(value) => replaceQuery({ search: value, page: 1 })}
      onSort={(key) => replaceQuery({ sort: nextSort(sort, key), page: 1 })}
      onPageChange={(nextPage) => replaceQuery({ page: nextPage })}
      onPageSizeChange={(nextSize) => replaceQuery({ pageSize: nextSize, page: 1 })}
      searchPlaceholder="Search pay components…"
      emptyMessage="No pay components yet. Add earnings (allowances) and deductions your company uses."
      actions={
        <button
          type="button"
          onClick={() =>
            overlay.show(<PayComponentDialog key={`new-${Date.now()}`} component={null} onClose={overlay.close} />)
          }
          className={primaryButtonClass}
        >
          <Plus className="size-4" />
          Add
        </button>
      }
    />
  );
}
