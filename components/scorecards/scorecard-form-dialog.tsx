"use client";

import { useState } from "react";
import {
  FormDialogFrame,
  FormField,
  sectionGridClass,
} from "@/components/form/form-dialog-frame";
import { formControlClass, formControlDisabledClass } from "@/components/form/form-control";
import { getHrState, saveItem, useHrState } from "@/components/hr/hr-store";
import { EmployeeSelect, RecordSelect } from "@/components/hr/record-select";
import { kpiScore } from "@/components/scorecards/score";
import type { ScorecardRow } from "@/components/scorecards/scorecard.types";

type ScorecardFormDialogProps = {
  scorecard?: ScorecardRow | null;
  onClose: () => void;
};

export function ScorecardFormDialog({ scorecard, onClose }: ScorecardFormDialogProps) {
  const { appraisalCycles, kpis } = useHrState();
  const [form, setForm] = useState({
    employeeId: scorecard?.employeeId ?? "",
    cycleId: scorecard?.cycleId ?? "",
    kpiId: scorecard?.kpiId ?? "",
    target: scorecard ? String(scorecard.target) : "",
    actual: scorecard ? String(scorecard.actual) : "",
  });
  const [error, setError] = useState("");

  const kpi = kpis.find((item) => item.id === form.kpiId);
  const score =
    kpi && form.target !== "" && form.actual !== ""
      ? kpiScore(kpi.direction, Number(form.target), Number(form.actual))
      : null;
  const cycleOptions = appraisalCycles
    .filter((cycle) => cycle.status === "Open" || cycle.id === scorecard?.cycleId)
    .map((cycle) => ({ id: cycle.id, label: cycle.cycleName }));

  function handleSubmit() {
    const target = Number(form.target);
    const actual = Number(form.actual);
    if (!form.employeeId || !form.cycleId || !form.kpiId || form.target === "" || form.actual === "") {
      setError("All fields are required.");
      return;
    }
    if (!Number.isFinite(target) || target <= 0) {
      setError("Target must be a number greater than 0.");
      return;
    }
    if (!Number.isFinite(actual) || actual < 0) {
      setError("Actual must be 0 or more.");
      return;
    }
    if (
      getHrState().scorecards.some(
        (item) =>
          item.id !== scorecard?.id &&
          item.employeeId === form.employeeId &&
          item.cycleId === form.cycleId &&
          item.kpiId === form.kpiId,
      )
    ) {
      setError("This employee already has this KPI in this cycle. Edit that entry instead.");
      return;
    }
    saveItem("scorecards", {
      id: scorecard?.id,
      employeeId: form.employeeId,
      cycleId: form.cycleId,
      kpiId: form.kpiId,
      target,
      actual,
    });
    onClose();
  }

  return (
    <FormDialogFrame
      title={scorecard ? "Update scorecard entry" : "Add scorecard entry"}
      submitLabel={scorecard ? "Save" : "Add"}
      onSubmit={handleSubmit}
      onClose={onClose}
      error={error}
    >
      <div className={sectionGridClass}>
        <FormField label="Employee *" className="sm:col-span-2">
          <EmployeeSelect
            value={form.employeeId}
            onChange={(employeeId) => setForm({ ...form, employeeId })}
          />
        </FormField>
        <FormField label="Cycle *">
          <RecordSelect
            options={cycleOptions}
            value={form.cycleId}
            onChange={(cycleId) => setForm({ ...form, cycleId })}
            emptyHint={{ text: "No open cycles. Add one first", href: "/appraisal-cycles" }}
          />
        </FormField>
        <FormField label="KPI *" hint={kpi ? `${kpi.direction} · ${kpi.unit}` : undefined}>
          <RecordSelect
            options={kpis.map((item) => ({ id: item.id, label: item.kpiName }))}
            value={form.kpiId}
            onChange={(kpiId) => setForm({ ...form, kpiId })}
            emptyHint={{ text: "No KPIs yet. Add them first", href: "/kpis" }}
          />
        </FormField>
        <FormField label="Target *">
          <input
            type="number"
            min={0}
            step="any"
            value={form.target}
            onChange={(event) => setForm({ ...form, target: event.target.value })}
            className={formControlClass}
          />
        </FormField>
        <FormField label="Actual *">
          <input
            type="number"
            min={0}
            step="any"
            value={form.actual}
            onChange={(event) => setForm({ ...form, actual: event.target.value })}
            className={formControlClass}
          />
        </FormField>
        <FormField label="Score" hint="Calculated from target and actual">
          <input
            value={score === null ? "" : `${score}%`}
            disabled
            className={formControlDisabledClass}
          />
        </FormField>
      </div>
    </FormDialogFrame>
  );
}
