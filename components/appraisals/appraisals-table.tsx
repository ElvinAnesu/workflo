"use client";

import { useMemo } from "react";
import { AppraisalFormDialog } from "@/components/appraisals/appraisal-form-dialog";
import type { AppraisalRow } from "@/components/appraisals/appraisal.types";
import { useOverlayDialog } from "@/components/dialog/overlay-dialog-provider";
import { deleteItem, useHrState } from "@/components/hr/hr-store";
import { useEmployeeNames } from "@/components/hr/record-select";
import { DataTable } from "@/components/table/data-table";
import type { DataTableColumn } from "@/components/table/data-table.types";
import { exportTable, RowActions, TableActions } from "@/components/table/table-actions";
import { useClientTable } from "@/components/table/use-client-table";

type AppraisalTableRow = AppraisalRow & { employee: string; cycle: string };

export function AppraisalsTable() {
  const overlay = useOverlayDialog();
  const { appraisals, appraisalCycles } = useHrState();
  const nameOf = useEmployeeNames();

  const rows = useMemo<AppraisalTableRow[]>(
    () =>
      appraisals.map((item) => ({
        ...item,
        employee: `${nameOf(item.employeeId)} (${item.employeeId})`,
        cycle: appraisalCycles.find((c) => c.id === item.cycleId)?.cycleName ?? "Deleted cycle",
      })),
    [appraisals, appraisalCycles, nameOf],
  );
  const table = useClientTable(rows, ["employee", "cycle", "overallRating", "status"]);

  const columns = useMemo<DataTableColumn<AppraisalTableRow>[]>(
    () => [
      { key: "employee", label: "Employee" },
      { key: "cycle", label: "Cycle" },
      { key: "overallRating", label: "Overall rating" },
      { key: "status", label: "Status" },
      { key: "comments", label: "Comments", sortable: false, render: () => null, exportValue: (row) => row.comments },
      {
        key: "actions",
        label: "Actions",
        sortable: false,
        render: (row) => (
          <RowActions
            onEdit={() =>
              overlay.show(
                <AppraisalFormDialog key={`edit-${row.id}`} appraisal={row} onClose={overlay.close} />,
              )
            }
            onDelete={() => {
              if (window.confirm(`Delete the ${row.cycle} appraisal for ${row.employee}?`)) {
                deleteItem("appraisals", row.id);
              }
            }}
          />
        ),
      },
    ],
    [overlay],
  );
  const visibleColumns = columns.filter((column) => column.key !== "comments");

  return (
    <DataTable
      {...table}
      columns={visibleColumns}
      searchPlaceholder="Search appraisals…"
      emptyMessage="No appraisals yet"
      actions={
        <TableActions
          onExport={() => exportTable("appraisals.csv", columns, table.allRows)}
          exportDisabled={rows.length === 0}
          onAdd={() =>
            overlay.show(
              <AppraisalFormDialog key={`new-${Date.now()}`} appraisal={null} onClose={overlay.close} />,
            )
          }
        />
      }
    />
  );
}
