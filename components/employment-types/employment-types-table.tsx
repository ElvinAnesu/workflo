"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  deleteEmploymentTypeAction,
  exportEmploymentTypesAction,
} from "@/app/(app)/employment-types/actions";
import { EmploymentTypeFormDialog } from "@/components/employment-types/employment-type-form-dialog";
import type { EmploymentTypeListRow } from "@/components/employment-types/employment-type.types";
import { useConfirmDialog } from "@/components/dialog/confirm-dialog-provider";
import { useOverlayDialog } from "@/components/dialog/overlay-dialog-provider";
import { DataTable } from "@/components/table/data-table";
import type {
  DataTableColumn,
  DataTableSort,
} from "@/components/table/data-table.types";
import { exportTable, RowActions, TableActions } from "@/components/table/table-actions";

type EmploymentTypesTableProps = {
  rows: EmploymentTypeListRow[];
  totalCount: number;
  search: string;
  page: number;
  pageSize: number;
  sort: DataTableSort;
};

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

export function EmploymentTypesTable({
  rows,
  totalCount,
  search,
  page,
  pageSize,
  sort,
}: EmploymentTypesTableProps) {
  const overlay = useOverlayDialog();
  const { confirm } = useConfirmDialog();
  const router = useRouter();
  const pathname = usePathname();

  function replaceQuery(next: Partial<EmploymentTypesTableProps>) {
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
    async (row: EmploymentTypeListRow) => {
      const ok = await confirm({
        title: "Delete employment type",
        message: "Delete this employment type?",
        confirmLabel: "Delete",
        variant: "danger",
      });
      if (!ok) {
        return;
      }
      const result = await deleteEmploymentTypeAction(row.id);
      if ("error" in result && result.error) {
        window.alert(result.error);
        return;
      }
      router.refresh();
    },
    [confirm, router],
  );

  const columns = useMemo<DataTableColumn<EmploymentTypeListRow>[]>(
    () => [
      {
        key: "index",
        label: "#",
        sortable: false,
        render: (_row, rowIndex) => (page - 1) * pageSize + rowIndex + 1,
      },
      { key: "name", label: "Employment type name" },
      {
        key: "actions",
        label: "Actions",
        sortable: false,
        render: (row) => (
          <RowActions
            onEdit={() =>
              overlay.show(
                <EmploymentTypeFormDialog
                  key={`edit-${row.id}`}
                  employmentType={row}
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
    [overlay, page, pageSize, remove],
  );

  async function handleExport() {
    const exported = await exportEmploymentTypesAction({
      search,
      sortKey: sort.key ?? "name",
      sortDirection: sort.direction === "desc" ? "desc" : "asc",
    });
    exportTable("employment-types", columns, exported);
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
      searchPlaceholder="Search employment types…"
      emptyMessage="No employment types yet"
      actions={
        <TableActions
          onExport={() => {
            void handleExport();
          }}
          onAdd={() =>
            overlay.show(
              <EmploymentTypeFormDialog
                key={`new-${Date.now()}`}
                employmentType={null}
                onClose={overlay.close}
              />,
            )
          }
        />
      }
    />
  );
}
