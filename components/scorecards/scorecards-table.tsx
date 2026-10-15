"use client";

import { useMemo } from "react";
import { useOverlayDialog } from "@/components/dialog/overlay-dialog-provider";
import { deleteItem, useHrState } from "@/components/hr/hr-store";
import { useEmployeeNames } from "@/components/hr/record-select";
import { kpiScore } from "@/components/scorecards/score";
import { ScorecardFormDialog } from "@/components/scorecards/scorecard-form-dialog";
import type { ScorecardRow } from "@/components/scorecards/scorecard.types";
import { DataTable } from "@/components/table/data-table";
import type { DataTableColumn } from "@/components/table/data-table.types";
import { exportTable, RowActions, TableActions } from "@/components/table/table-actions";
import { useClientTable } from "@/components/table/use-client-table";

type ScorecardTableRow = ScorecardRow & {
  employee: string;
  cycle: string;
  kpi: string;
  score: number | null;
};

export function ScorecardsTable() {
  const overlay = useOverlayDialog();
  const { scorecards, appraisalCycles, kpis } = useHrState();
  const nameOf = useEmployeeNames();

  const rows = useMemo<ScorecardTableRow[]>(
    () =>
      scorecards.map((item) => {
        const kpi = kpis.find((k) => k.id === item.kpiId);
        return {
          ...item,
          employee: `${nameOf(item.employeeId)} (${item.employeeId})`,
          cycle: appraisalCycles.find((c) => c.id === item.cycleId)?.cycleName ?? "Deleted cycle",
          kpi: kpi?.kpiName ?? "Deleted KPI",
          score: kpi ? kpiScore(kpi.direction, item.target, item.actual) : null,
        };
      }),
    [scorecards, appraisalCycles, kpis, nameOf],
  );
  const table = useClientTable(rows, ["employee", "cycle", "kpi"]);

  const columns = useMemo<DataTableColumn<ScorecardTableRow>[]>(
    () => [
      { key: "employee", label: "Employee" },
      { key: "cycle", label: "Cycle" },
      { key: "kpi", label: "KPI" },
      { key: "target", label: "Target" },
      { key: "actual", label: "Actual" },
      {
        key: "score",
        label: "Score",
        render: (row) =>
          row.score === null ? (
            "—"
          ) : (
            <span className={row.score >= 100 ? "font-medium text-emerald-700" : row.score < 70 ? "font-medium text-red-600" : ""}>
              {row.score}%
            </span>
          ),
        exportValue: (row) => (row.score === null ? "" : row.score),
      },
      {
        key: "actions",
        label: "Actions",
        sortable: false,
        render: (row) => (
          <RowActions
            onEdit={() =>
              overlay.show(
                <ScorecardFormDialog key={`edit-${row.id}`} scorecard={row} onClose={overlay.close} />,
              )
            }
            onDelete={() => {
              if (window.confirm(`Delete the ${row.kpi} entry for ${row.employee}?`)) {
                deleteItem("scorecards", row.id);
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
      searchPlaceholder="Search scorecards…"
      emptyMessage="No scorecard entries yet"
      actions={
        <TableActions
          onExport={() => exportTable("scorecards.csv", columns, table.allRows)}
          exportDisabled={rows.length === 0}
          onAdd={() =>
            overlay.show(
              <ScorecardFormDialog key={`new-${Date.now()}`} scorecard={null} onClose={overlay.close} />,
            )
          }
        />
      }
    />
  );
}
