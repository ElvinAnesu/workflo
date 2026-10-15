"use client";

import { useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  deleteOvertimeTypeAction,
  saveOvertimeHoursAction,
  saveOvertimeTypeAction,
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
import { parseAmount } from "@/components/payroll/payroll-format";
import type { OvertimeType } from "@/components/payroll/payroll.types";
import { DataTable } from "@/components/table/data-table";
import type { DataTableColumn, DataTableSort } from "@/components/table/data-table.types";
import { RowActions, TableActions } from "@/components/table/table-actions";

const invalidClass = "h-7 rounded-md border border-red-500 bg-red-50 px-2 text-xs text-zinc-700 outline-none";

function OvertimeTypeDialog({ type, onClose }: { type: OvertimeType | null; onClose: () => void }) {
  const router = useRouter();
  const [code, setCode] = useState(type?.code ?? "");
  const [name, setName] = useState(type?.name ?? "");
  const [multiplier, setMultiplier] = useState(type ? String(type.multiplier) : "");
  const [taxable, setTaxable] = useState(type?.taxable ?? true);
  const [active, setActive] = useState(type?.active ?? true);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const multiplierValue = parseAmount(multiplier);

  async function handleSubmit() {
    setSubmitted(true);
    const value = parseAmount(multiplier);
    if (!code.trim() || !name.trim()) {
      setError("Code and name are required.");
      return;
    }
    if (!(value > 0)) {
      setError("Enter a multiplier greater than 0, for example 1.5.");
      return;
    }
    const result = await saveOvertimeTypeAction({
      id: type ? Number(type.id) : undefined,
      code: code.trim().toUpperCase(),
      name: name.trim(),
      multiplier: value,
      taxable,
      active,
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
      title={type ? "Update overtime rate" : "Add overtime rate"}
      submitLabel={type ? "Save" : "Add"}
      onSubmit={() => {
        void handleSubmit();
      }}
      onClose={onClose}
      error={error}
    >
      <div className={sectionGridClass}>
        <FormField label="Code">
          <input
            value={code}
            onChange={(event) => setCode(event.target.value)}
            className={`${submitted && !code.trim() ? invalidClass : formControlClass} uppercase`}
          />
        </FormField>
        <FormField label="Name" className="sm:col-span-2" hint="For example: Weekday, Rest day, Public holiday">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            className={submitted && !name.trim() ? invalidClass : formControlClass}
          />
        </FormField>
        <FormField label="Multiplier" hint="× the hourly rate">
          <input
            inputMode="decimal"
            value={multiplier}
            onChange={(event) => setMultiplier(event.target.value)}
            className={submitted && !(multiplierValue > 0) ? invalidClass : formControlClass}
          />
        </FormField>
        <div className="flex flex-col gap-2 sm:col-span-4">
          <CheckboxField
            label="Taxable"
            hint="Included in taxable income for PAYE"
            checked={taxable}
            onChange={setTaxable}
          />
          <CheckboxField
            label="Active"
            hint="Inactive rates cannot be chosen for new overtime"
            checked={active}
            onChange={setActive}
          />
        </div>
      </div>
    </FormDialogFrame>
  );
}

function StandardHoursCard({ standardMonthlyHours }: { standardMonthlyHours: number }) {
  const router = useRouter();
  const [draft, setDraft] = useState<string | null>(null);
  const hours = draft ?? (standardMonthlyHours > 0 ? String(standardMonthlyHours) : "");
  const [message, setMessage] = useState("");

  async function handleSave() {
    const value = parseAmount(hours);
    if (!(value > 0) || value > 744) {
      setMessage("Enter the number of working hours in a month, between 1 and 744.");
      return;
    }
    const result = await saveOvertimeHoursAction(value);
    if ("error" in result && result.error) {
      setMessage(result.error);
      return;
    }
    setDraft(null);
    setMessage("Saved.");
    router.refresh();
  }

  return (
    <section className="flex flex-col gap-3 rounded-md border border-zinc-200 p-4">
      <div>
        <h2 className="text-sm font-semibold text-zinc-800">Hourly rate</h2>
        <p className="text-xs text-zinc-500">
          An employee&apos;s hourly rate is their basic salary divided by the standard working hours in a
          month. Overtime pay is hours × hourly rate × the rate&apos;s multiplier.
        </p>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <FormField label="Standard working hours per month">
          <input
            inputMode="decimal"
            value={hours}
            onChange={(event) => {
              setDraft(event.target.value);
              setMessage("");
            }}
            className={`${formControlClass} w-48`}
          />
        </FormField>
        <button
          type="button"
          onClick={() => {
            void handleSave();
          }}
          className={primaryButtonClass}
        >
          Save
        </button>
        {message ? (
          <p className={`self-center text-xs ${message === "Saved." ? "text-emerald-700" : "text-red-600"}`}>
            {message}
          </p>
        ) : null}
      </div>
    </section>
  );
}

export function OvertimeRatesPage({
  rows,
  totalCount,
  search,
  page,
  pageSize,
  sort,
  standardMonthlyHours,
}: {
  rows: OvertimeType[];
  totalCount: number;
  search: string;
  page: number;
  pageSize: number;
  sort: DataTableSort;
  standardMonthlyHours: number;
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

  const columns = useMemo<DataTableColumn<OvertimeType>[]>(
    () => [
      { key: "code", label: "Code" },
      { key: "name", label: "Name" },
      { key: "multiplier", label: "Multiplier", render: (row) => `${row.multiplier}×` },
      { key: "taxable", label: "Taxable", render: (row) => (row.taxable ? "Yes" : "No") },
      { key: "active", label: "Status", render: (row) => (row.active ? "Active" : "Inactive") },
      {
        key: "actions",
        label: "Actions",
        sortable: false,
        render: (row) => (
          <RowActions>
            <button
              type="button"
              onClick={() => overlay.show(<OvertimeTypeDialog key={`edit-${row.id}`} type={row} onClose={overlay.close} />)}
              className={linkButtonClass}
            >
              Edit
            </button>
            <button
              type="button"
              onClick={() => {
                if (window.confirm(`Delete the ${row.name} overtime rate?`)) {
                  void deleteOvertimeTypeAction(Number(row.id)).then((result) => {
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
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-base font-semibold text-zinc-800">Overtime rates</h1>
        <p className="text-xs text-zinc-500">
          Set how overtime is paid. Rates in use on an overtime sheet can be made inactive but not deleted.
        </p>
      </div>
      <StandardHoursCard standardMonthlyHours={standardMonthlyHours} />
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
        searchPlaceholder="Search overtime rates…"
        emptyMessage="No overtime rates yet"
        actions={
          <TableActions
            onAdd={() => overlay.show(<OvertimeTypeDialog key={`new-${Date.now()}`} type={null} onClose={overlay.close} />)}
          />
        }
      />
    </div>
  );
}
