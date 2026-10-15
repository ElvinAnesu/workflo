"use client";

import { useState } from "react";
import {
  APPRAISAL_RATINGS,
  type AppraisalRow,
} from "@/components/appraisals/appraisal.types";
import {
  FormDialogFrame,
  FormField,
  sectionGridClass,
} from "@/components/form/form-dialog-frame";
import { formControlClass } from "@/components/form/form-control";
import { getHrState, saveItem, useHrState } from "@/components/hr/hr-store";
import { EmployeeSelect, RecordSelect } from "@/components/hr/record-select";
import { averageScore, kpiScore } from "@/components/scorecards/score";

type AppraisalFormDialogProps = {
  appraisal?: AppraisalRow | null;
  onClose: () => void;
};

export function AppraisalFormDialog({ appraisal, onClose }: AppraisalFormDialogProps) {
  const { appraisalCycles, scorecards, kpis } = useHrState();
  const [form, setForm] = useState({
    employeeId: appraisal?.employeeId ?? "",
    cycleId: appraisal?.cycleId ?? "",
    overallRating: appraisal?.overallRating ?? "",
    comments: appraisal?.comments ?? "",
    status: appraisal?.status ?? "Draft",
  });
  const [error, setError] = useState("");

  const entries = scorecards.filter(
    (item) => item.employeeId === form.employeeId && item.cycleId === form.cycleId,
  );
  const kpiAverage = averageScore(
    entries.map((item) => {
      const kpi = kpis.find((k) => k.id === item.kpiId);
      return kpi ? kpiScore(kpi.direction, item.target, item.actual) : null;
    }),
  );
  const cycleOptions = appraisalCycles
    .filter((cycle) => cycle.status === "Open" || cycle.id === appraisal?.cycleId)
    .map((cycle) => ({ id: cycle.id, label: cycle.cycleName }));

  function handleSubmit() {
    if (!form.employeeId || !form.cycleId || !form.overallRating) {
      setError("Employee, cycle and overall rating are required.");
      return;
    }
    if (form.status === "Completed" && form.overallRating === "Unrated") {
      setError("Choose a rating before completing the appraisal.");
      return;
    }
    if (
      getHrState().appraisals.some(
        (item) =>
          item.id !== appraisal?.id &&
          item.employeeId === form.employeeId &&
          item.cycleId === form.cycleId,
      )
    ) {
      setError("This employee already has an appraisal in this cycle.");
      return;
    }
    saveItem("appraisals", {
      id: appraisal?.id,
      employeeId: form.employeeId,
      cycleId: form.cycleId,
      overallRating: form.overallRating as AppraisalRow["overallRating"],
      comments: form.comments.trim(),
      status: form.status as AppraisalRow["status"],
    });
    onClose();
  }

  return (
    <FormDialogFrame
      title={appraisal ? "Update appraisal" : "Add appraisal"}
      submitLabel={appraisal ? "Save" : "Add"}
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
        <FormField label="Status">
          <select
            value={form.status}
            onChange={(event) => setForm({ ...form, status: event.target.value as AppraisalRow["status"] })}
            className={formControlClass}
          >
            <option value="Draft">Draft</option>
            <option value="Completed">Completed</option>
          </select>
        </FormField>
        {form.employeeId && form.cycleId ? (
          <p className="rounded-md bg-zinc-50 px-3 py-2 text-xs text-zinc-600 sm:col-span-4">
            {entries.length > 0
              ? `Scorecard for this cycle: ${entries.length} KPI${entries.length === 1 ? "" : "s"}, average score ${kpiAverage ?? "—"}%.`
              : "No scorecard entries for this employee in this cycle yet."}
          </p>
        ) : null}
        <FormField label="Overall rating *">
          <select
            value={form.overallRating}
            onChange={(event) => setForm({ ...form, overallRating: event.target.value })}
            className={formControlClass}
          >
            <option value="">Select</option>
            {APPRAISAL_RATINGS.map((rating) => (
              <option key={rating} value={rating}>
                {rating}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Comments" className="sm:col-span-4">
          <textarea
            rows={3}
            value={form.comments}
            onChange={(event) => setForm({ ...form, comments: event.target.value })}
            className="rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-xs text-zinc-700 outline-none"
          />
        </FormField>
      </div>
    </FormDialogFrame>
  );
}
