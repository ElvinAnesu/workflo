"use client";

import { Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { deleteBankAction, saveBankAction } from "@/app/(app)/settings/payroll-actions";
import { useOverlayDialog } from "@/components/dialog/overlay-dialog-provider";
import {
  dangerLinkButtonClass,
  FormDialogFrame,
  FormField,
  linkButtonClass,
  primaryButtonClass,
  sectionGridClass,
} from "@/components/form/form-dialog-frame";
import { formControlClass } from "@/components/form/form-control";
import { nextSort, payrollQuery } from "@/components/payroll/list-query";
import type { BankListRow } from "@/components/payroll/payroll.types";
import { DataTable } from "@/components/table/data-table";
import { RowActions } from "@/components/table/table-actions";
import type { DataTableColumn, DataTableSort } from "@/components/table/data-table.types";

const invalidClass = "h-7 rounded-md border border-red-500 bg-red-50 px-2 text-xs text-zinc-700 outline-none";

function BankDialog({ bank, onClose }: { bank: BankListRow | null; onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = useState(bank?.name ?? "");
  const [code, setCode] = useState(bank?.code ?? "");
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit() {
    setSubmitted(true);
    if (!name.trim() || !code.trim()) {
      setError("Bank name and code are required.");
      return;
    }
    const result = await saveBankAction({
      id: bank?.id,
      name: name.trim(),
      code: code.trim().toUpperCase(),
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
      title={bank ? "Update bank" : "Add bank"}
      submitLabel={bank ? "Save" : "Add"}
      onSubmit={() => {
        void handleSubmit();
      }}
      onClose={onClose}
      error={error}
    >
      <div className={sectionGridClass}>
        <FormField label="Bank name" className="sm:col-span-2">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            className={submitted && !name.trim() ? invalidClass : formControlClass}
          />
        </FormField>
        <FormField label="SWIFT / bank code">
          <input
            value={code}
            onChange={(event) => setCode(event.target.value)}
            className={`${submitted && !code.trim() ? invalidClass : formControlClass} uppercase`}
          />
        </FormField>
      </div>
    </FormDialogFrame>
  );
}

export function BanksPage({
  rows,
  totalCount,
  search,
  page,
  pageSize,
  sort,
}: {
  rows: BankListRow[];
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

  const columns = useMemo<DataTableColumn<BankListRow>[]>(
    () => [
      { key: "name", label: "Bank" },
      { key: "code", label: "SWIFT / code" },
      { key: "employeeCount", label: "Employees" },
      {
        key: "actions",
        label: "Actions",
        sortable: false,
        render: (row) => (
          <RowActions>
            <button
              type="button"
              onClick={() =>
                overlay.show(<BankDialog key={`edit-${row.id}`} bank={row} onClose={overlay.close} />)
              }
              className={linkButtonClass}
            >
              Edit
            </button>
            <button
              type="button"
              onClick={() => {
                if (window.confirm(`Delete ${row.name}? Employees paid through it will need a new bank.`)) {
                  void deleteBankAction(row.id).then(() => router.refresh());
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
      searchPlaceholder="Search banks…"
      emptyMessage="No banks yet"
      actions={
        <button
          type="button"
          onClick={() => overlay.show(<BankDialog key={`new-${Date.now()}`} bank={null} onClose={overlay.close} />)}
          className={primaryButtonClass}
        >
          <Plus className="size-4" />
          Add
        </button>
      }
    />
  );
}
