"use client";

import { useState } from "react";
import {
  FormDialogFrame,
  FormField,
  sectionGridClass,
} from "@/components/form/form-dialog-frame";
import { formControlClass } from "@/components/form/form-control";
import { getHrState, saveItem } from "@/components/hr/hr-store";
import type { KpiRow } from "@/components/kpis/kpi.types";

type KpiFormDialogProps = {
  kpi?: KpiRow | null;
  onClose: () => void;
};

export function KpiFormDialog({ kpi, onClose }: KpiFormDialogProps) {
  const [form, setForm] = useState({
    kpiName: kpi?.kpiName ?? "",
    unit: kpi?.unit ?? "",
    direction: kpi?.direction ?? "",
    appliesTo: kpi?.appliesTo ?? "",
  });
  const [error, setError] = useState("");

  function handleSubmit() {
    const kpiName = form.kpiName.trim();
    if (!kpiName || !form.unit || !form.direction || !form.appliesTo) {
      setError("All fields are required.");
      return;
    }
    if (
      getHrState().kpis.some(
        (item) => item.id !== kpi?.id && item.kpiName.toLowerCase() === kpiName.toLowerCase(),
      )
    ) {
      setError(`A KPI called "${kpiName}" already exists.`);
      return;
    }
    saveItem("kpis", {
      id: kpi?.id,
      kpiName,
      unit: form.unit as KpiRow["unit"],
      direction: form.direction as KpiRow["direction"],
      appliesTo: form.appliesTo as KpiRow["appliesTo"],
    });
    onClose();
  }

  return (
    <FormDialogFrame
      title={kpi ? "Update KPI" : "Add KPI"}
      submitLabel={kpi ? "Save" : "Add"}
      onSubmit={handleSubmit}
      onClose={onClose}
      error={error}
    >
      <div className={sectionGridClass}>
        <FormField label="KPI name *">
          <input
            value={form.kpiName}
            onChange={(event) => setForm({ ...form, kpiName: event.target.value })}
            className={formControlClass}
          />
        </FormField>
        <FormField label="Unit *">
          <select
            value={form.unit}
            onChange={(event) => setForm({ ...form, unit: event.target.value })}
            className={formControlClass}
          >
            <option value="">Select</option>
            <option value="Number">Number</option>
            <option value="%">%</option>
            <option value="Days">Days</option>
          </select>
        </FormField>
        <FormField label="Direction *">
          <select
            value={form.direction}
            onChange={(event) => setForm({ ...form, direction: event.target.value })}
            className={formControlClass}
          >
            <option value="">Select</option>
            <option value="Higher is better">Higher is better</option>
            <option value="Lower is better">Lower is better</option>
          </select>
        </FormField>
        <FormField label="Applies to *">
          <select
            value={form.appliesTo}
            onChange={(event) => setForm({ ...form, appliesTo: event.target.value })}
            className={formControlClass}
          >
            <option value="">Select</option>
            <option value="Everyone">Everyone</option>
            <option value="Assign as needed">Assign as needed</option>
          </select>
        </FormField>
      </div>
    </FormDialogFrame>
  );
}
