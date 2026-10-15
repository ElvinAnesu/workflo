"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  deleteEmployeeAction,
  exportEmployeesAction,
  importEmployeesAction,
} from "@/app/(app)/employees/actions";
import { EmployeeRecordDialog } from "@/components/employees/employee-record-dialog";
import type {
  EmployeeImportRecord,
  EmployeeListRow,
  EmployeeLookupOption,
} from "@/components/employees/employee.types";
import { useConfirmDialog } from "@/components/dialog/confirm-dialog-provider";
import { useOverlayDialog } from "@/components/dialog/overlay-dialog-provider";
import { DataTable } from "@/components/table/data-table";
import type {
  DataTableColumn,
  DataTableSort,
} from "@/components/table/data-table.types";
import { ImportDialog } from "@/components/table/import-dialog";
import { exportTable, RowActions, TableActions } from "@/components/table/table-actions";

type EmployeesTableProps = {
  rows: EmployeeListRow[];
  totalCount: number;
  search: string;
  page: number;
  pageSize: number;
  sort: DataTableSort;
  nextCode: string;
  branches: EmployeeLookupOption[];
  departments: EmployeeLookupOption[];
  employmentTypes: EmployeeLookupOption[];
  employeeCategories: EmployeeLookupOption[];
};

const IMPORT_COLUMNS = [
  { key: "firstName", header: "First name", required: true },
  { key: "middleName", header: "Middle name" },
  { key: "lastName", header: "Last name", required: true },
  { key: "email", header: "Email" },
  { key: "phoneNumber", header: "Phone number" },
  { key: "designation", header: "Designation" },
  { key: "department", header: "Department" },
  { key: "branch", header: "Branch" },
  { key: "employmentType", header: "Employment type" },
  { key: "employeeCategory", header: "Employee category" },
  { key: "joinDate", header: "Join date" },
  { key: "status", header: "Status" },
];

function queryString(values: {
  search: string;
  page: number;
  pageSize: number;
  sort: DataTableSort;
}) {
  const params = new URLSearchParams();
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
  const encoded = params.toString();
  return encoded ? `?${encoded}` : "";
}

function importRecord(record: Record<string, string>): EmployeeImportRecord {
  return {
    firstName: record.firstName ?? "",
    middleName: record.middleName ?? "",
    lastName: record.lastName ?? "",
    email: record.email ?? "",
    phoneNumber: record.phoneNumber ?? "",
    designation: record.designation ?? "",
    department: record.department ?? "",
    branch: record.branch ?? "",
    employmentType: record.employmentType ?? "",
    employeeCategory: record.employeeCategory ?? "",
    joinDate: record.joinDate ?? "",
    status: record.status ?? "",
  };
}

export function EmployeesTable({
  rows,
  totalCount,
  search,
  page,
  pageSize,
  sort,
  nextCode,
  branches,
  departments,
  employmentTypes,
  employeeCategories,
}: EmployeesTableProps) {
  const overlay = useOverlayDialog();
  const { confirm } = useConfirmDialog();
  const router = useRouter();
  const pathname = usePathname();

  function replaceQuery(next: Partial<EmployeesTableProps>) {
    router.push(
      `${pathname}${queryString({
        search: next.search ?? search,
        page: next.page ?? page,
        pageSize: next.pageSize ?? pageSize,
        sort: next.sort ?? sort,
      })}`,
    );
  }

  const remove = useCallback(
    async (row: EmployeeListRow) => {
      const ok = await confirm({
        title: "Delete employee",
        message: `Delete ${row.firstName} ${row.lastName} (${row.employeeCode})? To keep their history, set their status to Terminated instead. Payrolls already calculated are not affected.`,
        confirmLabel: "Delete",
        variant: "danger",
      });
      if (!ok) {
        return;
      }
      const result = await deleteEmployeeAction(row.id);
      if ("error" in result && result.error) {
        window.alert(result.error);
        return;
      }
      router.refresh();
    },
    [confirm, router],
  );

  const columns = useMemo<DataTableColumn<EmployeeListRow>[]>(
    () => [
      {
        key: "index",
        label: "#",
        sortable: false,
        render: (_row, rowIndex) => (page - 1) * pageSize + rowIndex + 1,
      },
      { key: "employeeCode", label: "ID" },
      { key: "firstName", label: "First Name" },
      { key: "middleName", label: "Middle Name" },
      { key: "lastName", label: "Last Name" },
      { key: "designation", label: "Designation" },
      {
        key: "department",
        label: "Department",
        render: (row) => row.departmentName,
        exportValue: (row) => row.departmentName,
      },
      { key: "email", label: "Email" },
      { key: "status", label: "Status" },
      {
        key: "actions",
        label: "Actions",
        sortable: false,
        render: (row) => (
          <RowActions
            onEdit={() =>
              overlay.show(
                <EmployeeRecordDialog
                  key={`edit-${row.id}`}
                  employee={row}
                  nextCode={nextCode}
                  branches={branches}
                  departments={departments}
                  employmentTypes={employmentTypes}
                  employeeCategories={employeeCategories}
                  onClose={overlay.close}
                />,
              )
            }
            onDelete={() => {
              void remove(row);
            }}
          />
        ),
      },
    ],
    [
      branches,
      departments,
      employeeCategories,
      employmentTypes,
      nextCode,
      overlay,
      page,
      pageSize,
      remove,
    ],
  );

  async function handleExport() {
    const exported = await exportEmployeesAction({
      search,
      sortKey: sort.key ?? "employeeCode",
      sortDirection: sort.direction === "desc" ? "desc" : "asc",
    });
    exportTable("employees.csv", columns, exported);
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
      onPageSizeChange={(nextSize) =>
        replaceQuery({ pageSize: nextSize, page: 1 })
      }
      searchPlaceholder="Search employees…"
      emptyMessage="No employees"
      actions={
        <TableActions
          onExport={() => {
            void handleExport();
          }}
          exportDisabled={totalCount === 0}
          onImport={() =>
            overlay.show(
              <ImportDialog
                key={`import-${Date.now()}`}
                title="Import employees"
                templateName="employees-template.csv"
                columns={IMPORT_COLUMNS}
                onImport={(records, dryRun) =>
                  importEmployeesAction(records.map(importRecord), dryRun)
                }
                onClose={() => {
                  overlay.close();
                  router.refresh();
                }}
              />,
            )
          }
          onAdd={() =>
            overlay.show(
              <EmployeeRecordDialog
                key={`new-${Date.now()}`}
                employee={null}
                nextCode={nextCode}
                branches={branches}
                departments={departments}
                employmentTypes={employmentTypes}
                employeeCategories={employeeCategories}
                onClose={overlay.close}
              />,
            )
          }
        />
      }
    />
  );
}
