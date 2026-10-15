"use client";

import { useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  confirmHiringCandidateAction,
  exportHiringCandidatesAction,
  markHiringCandidateConvertedAction,
  rejectHiringCandidateAction,
  selectHiringCandidateAction,
  unselectHiringCandidateAction,
} from "@/app/(app)/hiring/actions";
import { useOverlayDialog } from "@/components/dialog/overlay-dialog-provider";
import { EmployeeRecordDialog } from "@/components/employees/employee-record-dialog";
import { formControlClass } from "@/components/form/form-control";
import { CandidateFormDialog } from "@/components/hiring/candidate-form-dialog";
import { CandidatesTableActions } from "@/components/hiring/candidates-table-actions";
import { HiringRequestDetailDialog } from "@/components/hiring/hiring-request-detail-dialog";
import { HiringStatusBadge } from "@/components/hiring/hiring-status-badge";
import type { HiringCandidateListRow, HiringFormOptions } from "@/components/hiring/hiring.types";
import { DataTable } from "@/components/table/data-table";
import type { DataTableColumn, DataTableSort } from "@/components/table/data-table.types";
import { exportTable, RowActions } from "@/components/table/table-actions";

type CandidatesTableProps = {
  rows: HiringCandidateListRow[];
  totalCount: number;
  status: string;
  search: string;
  page: number;
  pageSize: number;
  sort: DataTableSort;
  options: HiringFormOptions;
};

function queryString(values: {
  status: string;
  search: string;
  page: number;
  pageSize: number;
  sort: DataTableSort;
}) {
  const params = new URLSearchParams();
  if (values.status) {
    params.set("status", values.status);
  }
  if (values.search) {
    params.set("search", values.search);
  }
  if (values.page !== 1) {
    params.set("page", String(values.page));
  }
  if (values.pageSize !== 10) {
    params.set("pageSize", String(values.pageSize));
  }
  if (values.sort.key && values.sort.direction) {
    params.set("sort", values.sort.key);
    params.set("dir", values.sort.direction);
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}

const linkButtonClass = "text-xs font-medium text-[#1E40AF] disabled:cursor-not-allowed disabled:text-zinc-400";
const dangerLinkButtonClass = "text-xs font-medium text-red-600";

function CandidateRowActions({
  row,
  startDate,
  onStartDate,
  onOpenRequest,
  onEdit,
  onChanged,
  onConvert,
}: {
  row: HiringCandidateListRow;
  startDate: string;
  onStartDate: (value: string) => void;
  onOpenRequest: () => void;
  onEdit: () => void;
  onChanged: () => void;
  onConvert: () => void;
}) {
  const seatsFull = row.seatsTaken >= row.positions;

  async function run(action: () => Promise<{ error?: string; id?: number }>) {
    const result = await action();
    if ("error" in result && result.error) {
      window.alert(result.error);
      return;
    }
    onChanged();
  }

  return (
    <RowActions>
      <button type="button" onClick={onOpenRequest} className={linkButtonClass}>
        Open request
      </button>
      <button type="button" onClick={onEdit} className="text-xs font-medium text-zinc-600">
        Edit
      </button>
      {row.status === "Shortlisted" ? (
        <>
          <button
            type="button"
            disabled={row.requestStatus !== "Approved" || seatsFull}
            title={seatsFull ? "All positions already have a candidate" : ""}
            onClick={() => {
              void run(() => selectHiringCandidateAction(row.id));
            }}
            className={linkButtonClass}
          >
            Select
          </button>
          <button
            type="button"
            onClick={() => {
              void run(() => rejectHiringCandidateAction(row.id));
            }}
            className={dangerLinkButtonClass}
          >
            Not selected
          </button>
        </>
      ) : null}
      {row.status === "Selected" ? (
        <>
          <label className="flex flex-col gap-1 px-3 py-1.5 text-[11px] text-zinc-500">
            Start date
            <input
              type="date"
              aria-label="Start date"
              value={startDate}
              onChange={(event) => onStartDate(event.target.value)}
              className={formControlClass}
            />
          </label>
          <button
            type="button"
            onClick={() => {
              void run(() => confirmHiringCandidateAction(row.id, startDate));
            }}
            className={linkButtonClass}
          >
            Confirm hire
          </button>
          <button
            type="button"
            onClick={() => {
              void run(() => unselectHiringCandidateAction(row.id));
            }}
            className="text-xs font-medium text-zinc-500"
          >
            Undo
          </button>
        </>
      ) : null}
      {row.status === "Hire confirmed" ? (
        <button type="button" onClick={onConvert} className={linkButtonClass}>
          Convert to employee
        </button>
      ) : null}
    </RowActions>
  );
}

export function CandidatesTable({
  rows,
  totalCount,
  status,
  search,
  page,
  pageSize,
  sort,
  options,
}: CandidatesTableProps) {
  const overlay = useOverlayDialog();
  const router = useRouter();
  const pathname = usePathname();
  const [startDates, setStartDates] = useState<Record<number, string>>({});

  function replaceQuery(next: Partial<CandidatesTableProps>) {
    router.push(
      `${pathname}${queryString({
        status: next.status ?? status,
        search: next.search ?? search,
        page: next.page ?? page,
        pageSize: next.pageSize ?? pageSize,
        sort: next.sort ?? sort,
      })}`,
    );
  }

  const columns = useMemo<DataTableColumn<HiringCandidateListRow>[]>(
    () => [
      {
        key: "index",
        label: "#",
        sortable: false,
        render: (_row, rowIndex) => (page - 1) * pageSize + rowIndex + 1,
      },
      { key: "id", label: "ID", render: (row) => row.number, exportValue: (row) => row.number },
      { key: "name", label: "Name" },
      { key: "email", label: "Email" },
      { key: "phone", label: "Phone" },
      { key: "request", label: "Hiring request", render: (row) => row.requestLabel, exportValue: (row) => row.requestLabel },
      { key: "source", label: "Source" },
      { key: "addedOn", label: "Added on" },
      {
        key: "status",
        label: "Status",
        render: (row) => <HiringStatusBadge status={row.status} />,
        exportValue: (row) => row.status,
      },
      {
        key: "actions",
        label: "Actions",
        sortable: false,
        render: (row) => (
          <CandidateRowActions
            row={row}
            startDate={startDates[row.id] ?? row.desiredStartDate}
            onStartDate={(value) => setStartDates((current) => ({ ...current, [row.id]: value }))}
            onOpenRequest={() =>
              overlay.show(
                <HiringRequestDetailDialog
                  key={`view-${row.requestId}`}
                  requestId={row.requestId}
                  options={options}
                  onClose={overlay.close}
                />,
              )
            }
            onEdit={() =>
              overlay.show(
                <CandidateFormDialog
                  key={`edit-${row.id}`}
                  candidate={row}
                  approvedRequests={options.approvedRequests}
                  onClose={overlay.close}
                />,
              )
            }
            onChanged={() => router.refresh()}
            onConvert={() =>
              overlay.show(
                <EmployeeRecordDialog
                  key={`convert-${row.id}`}
                  employee={null}
                  nextCode={options.nextEmployeeCode}
                  branches={options.branches}
                  departments={options.departments}
                  employmentTypes={options.employmentTypes}
                  employeeCategories={options.employeeCategories}
                  initialValues={{
                    firstName: row.firstName,
                    middleName: row.middleName,
                    lastName: row.lastName,
                    email: row.email,
                    phoneNumber: row.phone,
                    designation: row.jobTitle,
                    departmentId: String(row.departmentId),
                    branchId: row.branchId ? String(row.branchId) : "",
                    employmentTypeId: row.employmentTypeId ? String(row.employmentTypeId) : "",
                    employeeCategoryId: row.employeeCategoryId ? String(row.employeeCategoryId) : "",
                    joinDate: row.startDate,
                    status: "Active",
                  }}
                  onCreated={async (created) => {
                    const result = await markHiringCandidateConvertedAction(row.id, created.id);
                    if ("error" in result && result.error) {
                      return { error: result.error };
                    }
                    return;
                  }}
                  onClose={() => {
                    overlay.close();
                    router.refresh();
                  }}
                />,
              )
            }
          />
        ),
      },
    ],
    [options, overlay, page, pageSize, router, startDates],
  );

  async function handleExport() {
    const exported = await exportHiringCandidatesAction({
      status,
      search,
      sortKey: sort.key ?? "",
      sortDirection: sort.direction === "desc" ? "desc" : "asc",
    });
    exportTable("hiring-candidates.csv", columns, exported);
  }

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
      onSort={(key) => {
        const nextSort: DataTableSort =
          sort.key !== key
            ? { key, direction: "asc" }
            : sort.direction === "asc"
              ? { key, direction: "desc" }
              : { key: null, direction: null };
        replaceQuery({ sort: nextSort, page: 1 });
      }}
      onPageChange={(nextPage) => replaceQuery({ page: nextPage })}
      onPageSizeChange={(nextSize) => replaceQuery({ pageSize: nextSize, page: 1 })}
      searchPlaceholder="Search candidates…"
      emptyMessage="No candidates"
      actions={
        <CandidatesTableActions
          status={status}
          onStatusChange={(value) => replaceQuery({ status: value, page: 1 })}
          onExport={() => {
            void handleExport();
          }}
          onAdd={() =>
            overlay.show(
              <CandidateFormDialog
                key={`new-${Date.now()}`}
                candidate={null}
                approvedRequests={options.approvedRequests}
                onClose={overlay.close}
              />,
            )
          }
        />
      }
    />
  );
}
