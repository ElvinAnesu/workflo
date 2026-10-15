"use client";

import { useState } from "react";
import type { AppraisalCycleRow } from "@/components/appraisal-cycles/appraisal-cycle.types";
import {
  FormDialogFrame,
  FormField,
  sectionGridClass,
} from "@/components/form/form-dialog-frame";
import { formControlClass } from "@/components/form/form-control";
import { getHrState, saveItem } from "@/components/hr/hr-store";

type AppraisalCycleFormDialogProps = {
  cycle?: AppraisalCycleRow | null;
  onClose: () => void;
};

export function AppraisalCycleFormDialog({ cycle, onClose }: AppraisalCycleFormDialogProps) {
  const [form, setForm] = useState({
    cycleName: cycle?.cycleName ?? "",
    startDate: cycle?.startDate ?? "",
    endDate: cycle?.endDate ?? "",
    status: cycle?.status ?? "Open",
  });
  const [error, setError] = useState("");

  function handleSubmit() {
    const cycleName = form.cycleName.trim();
    if (!cycleName || !form.startDate || !form.endDate) {
      setError("Cycle name, start and end date are required.");
      return;
    }
    if (form.endDate < form.startDate) {
      setError("The end date cannot be before the start date.");
      return;
    }
    if (
      getHrState().appraisalCycles.some(
        (item) => item.id !== cycle?.id && item.cycleName.toLowerCase() === cycleName.toLowerCase(),
      )
    ) {
      setError(`A cycle called "${cycleName}" already exists.`);
      return;
    }
    saveItem("appraisalCycles", {
      id: cycle?.id,
      cycleName,
      startDate: form.startDate,
      endDate: form.endDate,
      status: form.status as AppraisalCycleRow["status"],
    });
    onClose();
  }

  return (
    <FormDialogFrame
      title={cycle ? "Update appraisal cycle" : "Add appraisal cycle"}
      submitLabel={cycle ? "Save" : "Add"}
      onSubmit={handleSubmit}
      onClose={onClose}
      error={error}
    >
      <div className={sectionGridClass}>
        <FormField label="Cycle name *">
          <input
            value={form.cycleName}
            onChange={(event) => setForm({ ...form, cycleName: event.target.value })}
            className={formControlClass}
          />
        </FormField>
        <FormField label="Start *">
          <input
            type="date"
            value={form.startDate}
            onChange={(event) => setForm({ ...form, startDate: event.target.value })}
            className={formControlClass}
          />
        </FormField>
        <FormField label="End *">
          <input
            type="date"
            min={form.startDate || undefined}
            value={form.endDate}
            onChange={(event) => setForm({ ...form, endDate: event.target.value })}
            className={formControlClass}
          />
        </FormField>
        <FormField label="Status" hint="Closed cycles accept no new scorecards or appraisals">
          <select
            value={form.status}
            onChange={(event) => setForm({ ...form, status: event.target.value as AppraisalCycleRow["status"] })}
            className={formControlClass}
          >
            <option value="Open">Open</option>
            <option value="Closed">Closed</option>
          </select>
        </FormField>
      </div>
    </FormDialogFrame>
  );
}
