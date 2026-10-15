"use client";

import { useCallback, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  decideLeaveRequestAction,
  deleteLeaveRequestAction,
  exportLeaveRequestsAction,
} from "@/app/(app)/leave/actions";
import { useConfirmDialog } from "@/components/dialog/confirm-dialog-provider";
import { useOverlayDialog } from "@/components/dialog/overlay-dialog-provider";
import { FormDialogFrame, sectionGridClass } from "@/components/form/form-dialog-frame";
import { formControlClass } from "@/components/form/form-control";
import type { LeaveEmployeeOption } from "@/components/leave-balances/leave-balance.types";
import { LeaveRequestFormDialog } from "@/components/leave-requests/leave-request-form-dialog";
import {
  LEAVE_REQUEST_STATUSES,
  type LeaveRequestListRow,
  type LeaveRequestStatus,
} from "@/components/leave-requests/leave-request.types";
import { DataTable } from "@/components/table/data-table";
import type { DataTableColumn, DataTableSort } from "@/components/table/data-table.types";
import { exportTable, RowActions, TableActions } from "@/components/table/table-actions";

type LeaveRequestsTableProps = {
  rows: LeaveRequestListRow[];
  totalCount: number;
  status: string;
  search: string;
  page: number;
  pageSize: number;
  sort: DataTableSort;
  employees: LeaveEmployeeOption[];
};

const STATUS_CLASSES: Record<LeaveRequestStatus, string> = {
  Pending: "bg-amber-50 text-amber-700 ring-amber-200",
  Approved: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  Rejected: "bg-red-50 text-red-700 ring-red-200",
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
  if (
    values.sort.key &&
    values.sort.direction &&
    !(values.sort.key === "startDate" && values.sort.direction === "desc")
  ) {
    params.set("sort", values.sort.key);
    params.set("dir", values.sort.direction);
  }
  const encoded = params.toString();
  return encoded ? `?${encoded}` : "";
}

function employeeLabel(row: LeaveRequestListRow) {
  return `${row.employeeName} (${row.employeeCode})`;
}

function DecisionDialog({
  request,
  decision,
  onClose,
}: {
  request: LeaveRequestListRow;
  decision: "Approved" | "Rejected";
  onClose: () => void;
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function handleSubmit() {
    setPending(true);
    setError("");
    const result = await decideLeaveRequestAction(request.id, decision);
    setPending(false);
    if ("error" in result && result.error) {
      setError(result.error);
      return;
    }
    router.refresh();
    onClose();
  }

  return (
    <FormDialogFrame
      title={`${decision === "Approved" ? "Approve" : "Reject"} leave request`}
      submitLabel={pending ? "Saving…" : decision === "Approved" ? "Approve" : "Reject"}
      onSubmit={() => {
        void handleSubmit();
      }}
      onClose={onClose}
      error={error}
    >
      <div className={sectionGridClass}>
        <p className="text-xs text-zinc-600 sm:col-span-4">
          {employeeLabel(request)} · {request.leaveTypeName} · {request.startDate} to {request.endDate} (
          {request.days} day{request.days === 1 ? "" : "s"})
          {request.note ? ` · "${request.note}"` : ""}
        </p>
      </div>
    </FormDialogFrame>
  );
}

export function LeaveRequestsTable({
  rows,
  totalCount,
  status,
  search,
  page,
  pageSize,
  sort,
  employees,
}: LeaveRequestsTableProps) {
  const overlay = useOverlayDialog();
  const { confirm } = useConfirmDialog();
  const router = useRouter();
  const pathname = usePathname();

  function replaceQuery(next: Partial<LeaveRequestsTableProps>) {
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

  const remove = useCallback(
    async (row: LeaveRequestListRow) => {
      const ok = await confirm({
        title: "Delete leave request",
        message: row.status === "Rejected" ? "Delete this rejected request?" : "Delete this leave request?",
        confirmLabel: "Delete",
        variant: "danger",
      });
      if (!ok) {
        return;
      }
      const result = await deleteLeaveRequestAction(row.id);
      if ("error" in result && result.error) {
        window.alert(result.error);
        return;
      }
      router.refresh();
    },
    [confirm, router],
  );

  const columns = useMemo<DataTableColumn<LeaveRequestListRow>[]>(
    () => [
      { key: "employee", label: "Employee", render: (row) => employeeLabel(row), exportValue: (row) => employeeLabel(row) },
      {
        key: "leaveType",
        label: "Leave type",
        render: (row) => row.leaveTypeName,
        exportValue: (row) => row.leaveTypeName,
      },
      { key: "startDate", label: "Start" },
      { key: "endDate", label: "End" },
      { key: "days", label: "Days" },
      {
        key: "status",
        label: "Status",
        render: (row) => (
          <span
            title={row.decidedByName ? `${row.status} by ${row.decidedByName} on ${row.decidedOn}` : undefined}
            className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${STATUS_CLASSES[row.status]}`}
          >
            {row.status}
          </span>
        ),
      },
      {
        key: "decidedBy",
        label: "Decided by",
        render: (row) => (row.decidedByName ? `${row.decidedByName} · ${row.decidedOn}` : "—"),
        exportValue: (row) => (row.decidedByName ? `${row.decidedByName} · ${row.decidedOn}` : ""),
      },
      {
        key: "actions",
        label: "Actions",
        sortable: false,
        render: (row) =>
          row.status === "Pending" ? (
            <RowActions
              onEdit={() =>
                overlay.show(
                  <LeaveRequestFormDialog
                    key={`edit-${row.id}`}
                    request={row}
                    employees={employees}
                    onClose={overlay.close}
                  />,
                )
              }
              onDelete={() => {
                void remove(row);
              }}
            >
              <button
                type="button"
                onClick={() =>
                  overlay.show(
                    <DecisionDialog
                      key={`approve-${row.id}`}
                      request={row}
                      decision="Approved"
                      onClose={overlay.close}
                    />,
                  )
                }
                className="text-xs font-medium text-emerald-700"
              >
                Approve
              </button>
              <button
                type="button"
                onClick={() =>
                  overlay.show(
                    <DecisionDialog
                      key={`reject-${row.id}`}
                      request={row}
                      decision="Rejected"
                      onClose={overlay.close}
                    />,
                  )
                }
                className="text-xs font-medium text-red-600"
              >
                Reject
              </button>
            </RowActions>
          ) : row.status === "Rejected" ? (
            <RowActions
              onDelete={() => {
                void remove(row);
              }}
            />
          ) : (
            <span className="text-xs text-zinc-400">—</span>
          ),
      },
    ],
    [employees, overlay, remove],
  );

  async function handleExport() {
    const exported = await exportLeaveRequestsAction({
      status,
      search,
      sortKey: sort.key ?? "startDate",
      sortDirection: sort.direction === "asc" ? "asc" : "desc",
    });
    exportTable("leave-requests.csv", columns, exported);
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
            ? { key, direction: key === "startDate" ? "desc" : "asc" }
            : sort.direction === "desc"
              ? { key, direction: "asc" }
              : sort.direction === "asc"
                ? { key: null, direction: null }
                : { key, direction: "desc" };
        replaceQuery({ sort: nextSort, page: 1 });
      }}
      onPageChange={(nextPage) => replaceQuery({ page: nextPage })}
      onPageSizeChange={(nextSize) => replaceQuery({ pageSize: nextSize, page: 1 })}
      searchPlaceholder="Search leave requests…"
      emptyMessage="No leave requests"
      actions={
        <TableActions
          onExport={() => {
            void handleExport();
          }}
          exportDisabled={totalCount === 0}
          addLabel="New request"
          onAdd={() =>
            overlay.show(
              <LeaveRequestFormDialog
                key={`new-${Date.now()}`}
                request={null}
                employees={employees}
                onClose={overlay.close}
              />,
            )
          }
        >
          <select
            aria-label="Filter by status"
            value={status}
            onChange={(event) => replaceQuery({ status: event.target.value, page: 1 })}
            className={formControlClass}
          >
            <option value="">All statuses</option>
            {LEAVE_REQUEST_STATUSES.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </TableActions>
      }
    />
  );
}
