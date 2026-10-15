"use client";

import { useMemo } from "react";
import { AppraisalCycleFormDialog } from "@/components/appraisal-cycles/appraisal-cycle-form-dialog";
import type { AppraisalCycleRow } from "@/components/appraisal-cycles/appraisal-cycle.types";
import { useOverlayDialog } from "@/components/dialog/overlay-dialog-provider";
import { deleteItem, getHrState, useHrState } from "@/components/hr/hr-store";
import { DataTable } from "@/components/table/data-table";
import type { DataTableColumn } from "@/components/table/data-table.types";
import { exportTable, RowActions, TableActions } from "@/components/table/table-actions";
import { useClientTable } from "@/components/table/use-client-table";

export function AppraisalCyclesTable() {
  const overlay = useOverlayDialog();
  const { appraisalCycles } = useHrState();
  const table = useClientTable(appraisalCycles, ["cycleName", "status"]);

  const columns = useMemo<DataTableColumn<AppraisalCycleRow>[]>(
    () => [
      { key: "cycleName", label: "Cycle name" },
      { key: "startDate", label: "Start" },
      { key: "endDate", label: "End" },
      { key: "status", label: "Status" },
      {
        key: "actions",
        label: "Actions",
        sortable: false,
        render: (row) => (
          <RowActions
            onEdit={() =>
              overlay.show(
                <AppraisalCycleFormDialog key={`edit-${row.id}`} cycle={row} onClose={overlay.close} />,
              )
            }
            onDelete={() => {
              const state = getHrState();
              const used =
                state.scorecards.filter((item) => item.cycleId === row.id).length +
                state.appraisals.filter((item) => item.cycleId === row.id).length;
              if (used > 0) {
                window.alert(`${row.cycleName} cannot be deleted because scorecards or appraisals use it. Close it instead.`);
                return;
              }
              if (window.confirm(`Delete the ${row.cycleName} cycle?`)) {
                deleteItem("appraisalCycles", row.id);
              }
            }}
          />
        ),
      },
    ],
    [overlay],
  );

  return (
    <DataTable
      {...table}
      columns={columns}
      searchPlaceholder="Search appraisal cycles…"
      emptyMessage="No appraisal cycles yet"
      actions={
        <TableActions
          onExport={() => exportTable("appraisal-cycles.csv", columns, table.allRows)}
          exportDisabled={appraisalCycles.length === 0}
          onAdd={() =>
            overlay.show(
              <AppraisalCycleFormDialog key={`new-${Date.now()}`} cycle={null} onClose={overlay.close} />,
            )
          }
        />
      }
    />
  );
}
