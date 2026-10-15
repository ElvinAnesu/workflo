"use client";

import {
  useState,
  useSyncExternalStore,
  type FormEvent,
  type ReactNode,
} from "react";
import { CheckCircle2, Lock, ShieldCheck } from "lucide-react";
import {
  competenciesFor,
  OPEN_QUESTIONS,
  RATING_SCALE,
} from "@/components/feedback-360/feedback-360-questions";
import {
  submitResponse,
  useFeedback360State,
} from "@/components/feedback-360/feedback-360-store";
import type { RaterGroup } from "@/components/feedback-360/feedback-360.types";

type RespondentFormProps = {
  token: string;
};

const NOT_ABLE = "na";

function subscribeNoop() {
  return () => {};
}

function useIsClient() {
  return useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false,
  );
}

function relationshipOptions(name: string): { group: RaterGroup; label: string }[] {
  return [
    { group: "Self", label: `I am ${name}` },
    { group: "Manager", label: `I am ${name}'s manager` },
    { group: "Peer", label: `I am a peer / colleague` },
    { group: "Direct report", label: `${name} is my manager` },
    { group: "Other", label: "Other (customer, other department…)" },
  ];
}

function PageFrame({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-full bg-[#F4F6FB] px-4 py-8 sm:py-12">
      <div className="mx-auto flex max-w-2xl flex-col gap-4">
        <div className="flex items-center gap-2 text-xs font-semibold tracking-wide text-[#172554]">
          <span className="flex size-7 items-center justify-center rounded-md bg-[#172554] text-[11px] text-white">
            W
          </span>
          WORKFLO · 360° FEEDBACK
        </div>
        {children}
        <p className="flex items-center justify-center gap-1.5 pt-2 text-[11px] text-zinc-400">
          <Lock className="size-3" />
          Responses are anonymous and reported only in combination with
          others.
        </p>
      </div>
    </div>
  );
}

function MessageCard({ title, body }: { title: string; body: string }) {
  return (
    <PageFrame>
      <div className="rounded-xl border border-zinc-200/80 bg-white p-8 text-center shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
        <h1 className="text-base font-semibold text-zinc-800">{title}</h1>
        <p className="mt-2 text-sm text-zinc-500">{body}</p>
      </div>
    </PageFrame>
  );
}

export function RespondentForm({ token }: RespondentFormProps) {
  const isClient = useIsClient();
  const { reviews } = useFeedback360State();
  const review = reviews.find((item) => item.token === token);
  const [group, setGroup] = useState<RaterGroup | "">("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [comments, setComments] = useState<Record<string, string>>({});
  const [showErrors, setShowErrors] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  if (!isClient) {
    return <PageFrame>{null}</PageFrame>;
  }

  if (submitted) {
    return (
      <PageFrame>
        <div className="flex flex-col items-center gap-3 rounded-xl border border-zinc-200/80 bg-white p-10 text-center shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
          <CheckCircle2 className="size-10 text-emerald-500" />
          <h1 className="text-lg font-semibold text-zinc-800">
            Thank you for your feedback
          </h1>
          <p className="max-w-md text-sm text-zinc-500">
            Your response has been recorded anonymously. You can close this
            page.
          </p>
        </div>
      </PageFrame>
    );
  }

  if (!review) {
    return (
      <MessageCard
        title="This feedback link isn't valid"
        body="Check that you copied the full link, or ask HR for a new one."
      />
    );
  }

  if (review.status !== "Collecting") {
    return (
      <MessageCard
        title="This feedback request is closed"
        body={`Feedback for ${review.employeeName} is no longer being collected. Thank you for your time.`}
      />
    );
  }

  const competencies = competenciesFor(review.competencyKeys);
  const questionIds = competencies.flatMap((c) => c.questions.map((q) => q.id));
  const answeredCount = questionIds.filter((id) => answers[id]).length;
  const firstName = review.employeeName.split(" ")[0] || review.employeeName;
  const isSelf = group === "Self";

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!group || answeredCount < questionIds.length) {
      setShowErrors(true);
      document
        .querySelector("[data-missing='true']")
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    const ratings = Object.fromEntries(
      questionIds.map((id) => [
        id,
        answers[id] === NOT_ABLE ? null : Number(answers[id]),
      ]),
    );

    if (submitResponse(token, { group, ratings, comments })) {
      setSubmitted(true);
      window.scrollTo({ top: 0 });
    }
  }

  return (
    <PageFrame>
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        <header className="rounded-xl border border-zinc-200/80 bg-white p-6 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
          <p className="text-xs font-medium text-[#1E40AF]">
            Confidential feedback for
          </p>
          <h1 className="mt-1 text-xl font-semibold text-zinc-900">
            {review.employeeName}
          </h1>
          {review.jobTitle || review.department ? (
            <p className="text-sm text-zinc-500">
              {[review.jobTitle, review.department].filter(Boolean).join(" · ")}
            </p>
          ) : null}
          {review.message ? (
            <p className="mt-4 text-sm leading-relaxed text-zinc-600">
              {review.message}
            </p>
          ) : null}
          <div className="mt-4 flex items-start gap-2 rounded-lg bg-emerald-50 p-3 text-xs text-emerald-800">
            <ShieldCheck className="mt-px size-4 shrink-0" />
            <span>
              We don&apos;t ask for your name. Peer and team ratings are only
              shown once at least {review.anonymityThreshold} people in the
              same group have responded, and written comments are never linked
              to you.
            </span>
          </div>
        </header>

        <section
          data-missing={showErrors && !group}
          className={`rounded-xl border bg-white p-6 shadow-[0_1px_2px_rgba(16,24,40,0.04)] ${
            showErrors && !group ? "border-red-300" : "border-zinc-200/80"
          }`}
        >
          <h2 className="text-sm font-semibold text-zinc-800">
            How do you work with {firstName}?
          </h2>
          <p className="mt-0.5 text-xs text-zinc-500">
            This groups your answers with others in the same role.
          </p>
          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {relationshipOptions(firstName).map((option) => (
              <label
                key={option.group}
                className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 text-sm ${
                  group === option.group
                    ? "border-[#1E40AF] bg-blue-50/60 text-zinc-900"
                    : "border-zinc-200 text-zinc-700 hover:bg-zinc-50"
                }`}
              >
                <input
                  type="radio"
                  name="group"
                  checked={group === option.group}
                  onChange={() => setGroup(option.group)}
                  className="accent-[#1E40AF]"
                />
                {option.label}
              </label>
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-zinc-200/80 bg-white p-6 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold text-zinc-800">
              {isSelf ? "Rate yourself" : `Rate ${firstName}`}
            </h2>
            <span className="text-xs text-zinc-500">
              {answeredCount} of {questionIds.length} answered
            </span>
          </div>
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-zinc-100">
            <div
              className="h-full rounded-full bg-[#1E40AF] transition-[width] duration-300"
              style={{
                width: `${(answeredCount / Math.max(1, questionIds.length)) * 100}%`,
              }}
            />
          </div>
          <dl className="mt-4 grid grid-cols-5 gap-1 text-center text-[10px] leading-tight text-zinc-500">
            {RATING_SCALE.map((item) => (
              <div key={item.value}>
                <dt className="font-semibold text-zinc-700">{item.value}</dt>
                <dd>{item.label}</dd>
              </div>
            ))}
          </dl>

          <div className="mt-6 flex flex-col gap-6">
            {competencies.map((competency) => (
              <div key={competency.key} className="flex flex-col gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-zinc-800">
                    {competency.name}
                  </h3>
                  <p className="text-xs text-zinc-500">
                    {competency.description}
                  </p>
                </div>
                {competency.questions.map((question) => {
                  const missing = showErrors && !answers[question.id];
                  return (
                    <fieldset
                      key={question.id}
                      data-missing={missing}
                      className={`flex flex-col gap-2 rounded-lg border p-3 ${
                        missing ? "border-red-300 bg-red-50/40" : "border-zinc-100"
                      }`}
                    >
                      <legend className="sr-only">{question.text}</legend>
                      <p className="text-sm text-zinc-700">{question.text}</p>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {RATING_SCALE.map((item) => {
                          const selected =
                            answers[question.id] === String(item.value);
                          return (
                            <label
                              key={item.value}
                              title={item.label}
                              className={`flex size-9 cursor-pointer items-center justify-center rounded-md border text-sm font-medium transition-colors ${
                                selected
                                  ? "border-[#172554] bg-[#172554] text-white"
                                  : "border-zinc-200 text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50"
                              }`}
                            >
                              <input
                                type="radio"
                                name={question.id}
                                value={item.value}
                                checked={selected}
                                onChange={() =>
                                  setAnswers((current) => ({
                                    ...current,
                                    [question.id]: String(item.value),
                                  }))
                                }
                                className="sr-only"
                              />
                              {item.value}
                            </label>
                          );
                        })}
                        <label
                          className={`ml-1 flex h-9 cursor-pointer items-center rounded-md border px-2.5 text-xs transition-colors ${
                            answers[question.id] === NOT_ABLE
                              ? "border-zinc-500 bg-zinc-100 text-zinc-800"
                              : "border-zinc-200 text-zinc-500 hover:bg-zinc-50"
                          }`}
                        >
                          <input
                            type="radio"
                            name={question.id}
                            value={NOT_ABLE}
                            checked={answers[question.id] === NOT_ABLE}
                            onChange={() =>
                              setAnswers((current) => ({
                                ...current,
                                [question.id]: NOT_ABLE,
                              }))
                            }
                            className="sr-only"
                          />
                          Not able to rate
                        </label>
                      </div>
                    </fieldset>
                  );
                })}
              </div>
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-4 rounded-xl border border-zinc-200/80 bg-white p-6 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
          <div>
            <h2 className="text-sm font-semibold text-zinc-800">
              In your own words
            </h2>
            <p className="text-xs text-zinc-500">
              Optional, but the most useful part. Specific examples help most.
            </p>
          </div>
          {OPEN_QUESTIONS.map((question) => (
            <label
              key={question.id}
              className="flex flex-col gap-1.5 text-sm text-zinc-700"
            >
              {isSelf
                ? question.text.replace("this person", "you")
                : question.text.replace("this person", firstName)}
              <textarea
                rows={3}
                value={comments[question.id] ?? ""}
                onChange={(event) =>
                  setComments((current) => ({
                    ...current,
                    [question.id]: event.target.value,
                  }))
                }
                className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700 outline-none focus:border-[#1E40AF]"
              />
            </label>
          ))}
        </section>

        <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-red-600">
            {showErrors && (!group || answeredCount < questionIds.length)
              ? "Please answer every question (or choose “Not able to rate”) and say how you work together."
              : ""}
          </p>
          <button
            type="submit"
            className="inline-flex h-10 items-center justify-center rounded-md bg-[#172554] px-5 text-sm font-medium text-white"
          >
            Submit feedback
          </button>
        </div>
      </form>
    </PageFrame>
  );
}
