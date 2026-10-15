"use client";

import Link from "next/link";
import { useState, type FormEvent, type ReactNode } from "react";
import { ShieldCheck, X } from "lucide-react";
import { formControlClass } from "@/components/form/form-control";
import { FormSectionStrip } from "@/components/form/form-section-strip";
import { CopyLinkButton } from "@/components/feedback-360/copy-link-button";
import {
  COMPETENCIES,
  DEFAULT_COMPETENCY_KEYS,
} from "@/components/feedback-360/feedback-360-questions";
import {
  createReview,
  feedbackLink,
} from "@/components/feedback-360/feedback-360-store";
import type {
  FeedbackReview,
  FeedbackReviewInput,
} from "@/components/feedback-360/feedback-360.types";

type ReviewFormDialogProps = {
  onClose: () => void;
};

type ReviewFormState = Omit<FeedbackReviewInput, "anonymityThreshold"> & {
  anonymityThreshold: string;
};

const sectionGridClass = "grid grid-cols-1 gap-2 p-4 sm:grid-cols-4";

const DEFAULT_MESSAGE =
  "You have been asked to give confidential feedback. Your answers are anonymous and will only be shown combined with other responses. Please be honest and specific — it takes about 5 minutes.";

function FormField({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label
      className={`flex flex-col gap-1 text-xs text-zinc-600 ${className ?? ""}`}
    >
      {label}
      {children}
    </label>
  );
}

export function ReviewFormDialog({ onClose }: ReviewFormDialogProps) {
  const [created, setCreated] = useState<FeedbackReview | null>(null);
  const [error, setError] = useState("");
  const [form, setForm] = useState<ReviewFormState>({
    employeeName: "",
    jobTitle: "",
    department: "",
    dueDate: "",
    competencyKeys: DEFAULT_COMPETENCY_KEYS,
    anonymityThreshold: "3",
    message: DEFAULT_MESSAGE,
  });

  function updateField(
    key: Exclude<keyof ReviewFormState, "competencyKeys">,
    value: string,
  ) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function toggleCompetency(key: string) {
    setForm((current) => ({
      ...current,
      competencyKeys: current.competencyKeys.includes(key)
        ? current.competencyKeys.filter((item) => item !== key)
        : [...current.competencyKeys, key],
    }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (form.competencyKeys.length === 0) {
      setError("Choose at least one competency.");
      return;
    }

    setError("");
    setCreated(
      createReview({
        ...form,
        anonymityThreshold: Number(form.anonymityThreshold),
      }),
    );
  }

  const header = (title: string) => (
    <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
      <h2 className="text-base font-semibold text-zinc-800">{title}</h2>
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="inline-flex size-8 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-100"
      >
        <X className="size-4" />
      </button>
    </div>
  );

  if (created) {
    const link = feedbackLink(created.token);

    return (
      <div className="flex h-full min-h-0 flex-col">
        {header("360 review created")}
        <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-6">
          <div className="flex w-full max-w-xl flex-col items-center gap-4 text-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
              <ShieldCheck className="size-6" />
            </span>
            <div className="flex flex-col gap-1">
              <h3 className="text-sm font-semibold text-zinc-800">
                Share this anonymous link
              </h3>
              <p className="text-xs text-zinc-500">
                Send it to {created.employeeName}&apos;s manager, peers, direct
                reports and to {created.employeeName} for the self-assessment.
                Raters don&apos;t need an account.
              </p>
            </div>
            <div className="flex w-full items-center gap-2">
              <input
                readOnly
                value={link}
                onFocus={(event) => event.target.select()}
                className={`${formControlClass} h-9 min-w-0 flex-1`}
              />
              <CopyLinkButton link={link} />
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-zinc-200 px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 items-center rounded-md border border-zinc-200 bg-white px-3 text-sm font-medium text-zinc-700"
          >
            Done
          </button>
          <Link
            href={`/feedback-360/${created.id}`}
            onClick={onClose}
            className="inline-flex h-9 items-center rounded-md bg-[#172554] px-3 text-sm font-medium text-white"
          >
            Open review
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex h-full min-h-0 flex-col">
      {header("New 360 review")}
      <div className="min-h-0 flex-1 overflow-auto">
        <FormSectionStrip title="Who is being reviewed" />
        <div className={sectionGridClass}>
          <FormField label="Employee">
            <input
              required
              value={form.employeeName}
              onChange={(event) =>
                updateField("employeeName", event.target.value)
              }
              className={formControlClass}
            />
          </FormField>
          <FormField label="Job title">
            <input
              value={form.jobTitle}
              onChange={(event) => updateField("jobTitle", event.target.value)}
              className={formControlClass}
            />
          </FormField>
          <FormField label="Department">
            <input
              value={form.department}
              onChange={(event) =>
                updateField("department", event.target.value)
              }
              className={formControlClass}
            />
          </FormField>
          <FormField label="Responses due">
            <input
              type="date"
              value={form.dueDate}
              onChange={(event) => updateField("dueDate", event.target.value)}
              className={formControlClass}
            />
          </FormField>
        </div>
        <FormSectionStrip title="Competencies to rate" />
        <div className="grid grid-cols-1 gap-2 p-4 sm:grid-cols-2 lg:grid-cols-4">
          {COMPETENCIES.map((competency) => {
            const checked = form.competencyKeys.includes(competency.key);
            return (
              <label
                key={competency.key}
                className={`flex cursor-pointer gap-2 rounded-md border p-3 text-xs ${
                  checked
                    ? "border-[#1E40AF] bg-blue-50/50"
                    : "border-zinc-200 bg-white"
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleCompetency(competency.key)}
                  className="mt-0.5"
                />
                <span className="flex flex-col gap-0.5">
                  <span className="font-semibold text-zinc-800">
                    {competency.name}
                  </span>
                  <span className="text-zinc-500">{competency.description}</span>
                </span>
              </label>
            );
          })}
          {error ? (
            <p className="text-xs text-red-600 sm:col-span-2 lg:col-span-4">
              {error}
            </p>
          ) : null}
        </div>
        <FormSectionStrip title="Anonymity and message" />
        <div className={sectionGridClass}>
          <FormField label="Minimum responses per group">
            <select
              value={form.anonymityThreshold}
              onChange={(event) =>
                updateField("anonymityThreshold", event.target.value)
              }
              className={formControlClass}
            >
              {[1, 2, 3, 4, 5].map((value) => (
                <option key={value} value={value}>
                  {value}
                  {value === 3 ? " (recommended)" : ""}
                </option>
              ))}
            </select>
          </FormField>
          <p className="self-end pb-1 text-xs text-zinc-500 sm:col-span-3">
            Peer, direct report and other ratings are only shown once a group
            reaches this many responses, so no single rater can be identified.
          </p>
          <FormField label="Message to raters" className="sm:col-span-4">
            <textarea
              rows={3}
              value={form.message}
              onChange={(event) => updateField("message", event.target.value)}
              className="rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-xs text-zinc-700 outline-none"
            />
          </FormField>
        </div>
      </div>
      <div className="flex justify-end gap-2 border-t border-zinc-200 px-4 py-3">
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-9 items-center rounded-md border border-zinc-200 bg-white px-3 text-sm font-medium text-zinc-700"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="inline-flex h-9 items-center rounded-md bg-[#172554] px-3 text-sm font-medium text-white"
        >
          Create and get link
        </button>
      </div>
    </form>
  );
}
