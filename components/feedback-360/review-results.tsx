"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import {
  ArrowDownRight,
  ArrowLeft,
  ArrowUpRight,
  EyeOff,
  Lock,
  Printer,
  Quote,
  Sparkles,
  Target,
} from "lucide-react";
import { CopyLinkButton } from "@/components/feedback-360/copy-link-button";
import {
  buildReport,
  formatScore,
  GAP_THRESHOLD,
  type CompetencyScore,
  type ItemScore,
} from "@/components/feedback-360/feedback-360-report";
import {
  deleteReview,
  feedbackLink,
  setReviewStatus,
  useFeedback360State,
} from "@/components/feedback-360/feedback-360-store";
import {
  RATER_GROUPS,
  type RaterGroup,
} from "@/components/feedback-360/feedback-360.types";
import { ReviewStatusBadge } from "@/components/feedback-360/review-status-badge";

type ReviewResultsProps = {
  reviewId: string;
};

// Categorical slots 1 and 2 of the reference data-viz palette (validated pair).
const OTHERS_COLOR = "#2a78d6";
const SELF_COLOR = "#eb6834";
const SCALE_MAX = 5;

const GROUP_LABELS: Record<RaterGroup, string> = {
  Self: "Self",
  Manager: "Manager",
  Peer: "Peers",
  "Direct report": "Direct reports",
  Other: "Others",
};

const cardClass = "rounded-lg border border-zinc-200/80 bg-white";

function SectionTitle({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <h2 className="text-sm font-semibold text-zinc-800">{title}</h2>
      {description ? (
        <p className="text-xs text-zinc-500">{description}</p>
      ) : null}
    </div>
  );
}

function StatTile({
  label,
  value,
  suffix,
  note,
}: {
  label: string;
  value: string;
  suffix?: string;
  note?: string;
}) {
  return (
    <div className={`${cardClass} flex flex-col gap-1 p-4`}>
      <span className="text-xs text-zinc-500">{label}</span>
      <span className="text-2xl font-semibold tracking-tight text-zinc-900 tabular-nums">
        {value}
        {suffix && value !== "—" ? (
          <span className="ml-0.5 text-sm font-normal text-zinc-400">
            {suffix}
          </span>
        ) : null}
      </span>
      {note ? <span className="text-[11px] text-zinc-500">{note}</span> : null}
    </div>
  );
}

function Bar({ value, color }: { value: number | null; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="relative h-2 flex-1">
        {value !== null ? (
          <div
            className="absolute inset-y-0 left-0 rounded-r-[4px]"
            style={{
              width: `${(value / SCALE_MAX) * 100}%`,
              backgroundColor: color,
            }}
          />
        ) : null}
      </div>
      <span className="w-7 text-right text-xs text-zinc-700 tabular-nums">
        {formatScore(value)}
      </span>
    </div>
  );
}

function CompetencyChart({ scores }: { scores: CompetencyScore[] }) {
  const [hovered, setHovered] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-4 text-xs text-zinc-600">
        <span className="inline-flex items-center gap-1.5">
          <span
            className="size-2.5 rounded-sm"
            style={{ backgroundColor: OTHERS_COLOR }}
          />
          All raters (excluding self)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            className="size-2.5 rounded-sm"
            style={{ backgroundColor: SELF_COLOR }}
          />
          Self
        </span>
      </div>
      <div className="grid grid-cols-[minmax(7rem,10rem)_1fr] gap-x-4">
        <div />
        <div className="relative mr-9 h-4 text-[10px] text-zinc-400">
          {[1, 2, 3, 4, 5].map((tick) => (
            <span
              key={tick}
              className="absolute -translate-x-1/2"
              style={{ left: `${(tick / SCALE_MAX) * 100}%` }}
            >
              {tick}
            </span>
          ))}
        </div>
        {scores.map((score) => (
          <div
            key={score.key}
            onMouseEnter={() => setHovered(score.key)}
            onMouseLeave={() => setHovered(null)}
            className="relative col-span-2 grid grid-cols-subgrid items-center rounded-md py-2 hover:bg-zinc-50"
          >
            <span className="truncate pl-1 text-xs font-medium text-zinc-700">
              {score.name}
            </span>
            <div className="relative flex flex-col gap-[2px]">
              <div className="pointer-events-none absolute inset-y-0 right-9 left-0">
                {[1, 2, 3, 4, 5].map((tick) => (
                  <span
                    key={tick}
                    className="absolute inset-y-0 w-px bg-zinc-100"
                    style={{ left: `${(tick / SCALE_MAX) * 100}%` }}
                  />
                ))}
              </div>
              <Bar value={score.others} color={OTHERS_COLOR} />
              <Bar value={score.self} color={SELF_COLOR} />
            </div>
            {hovered === score.key ? (
              <div className="pointer-events-none absolute top-full right-10 z-10 mt-1 w-56 rounded-md border border-zinc-200 bg-white p-3 text-xs shadow-[0_8px_24px_rgba(16,24,40,0.12)] print:hidden">
                <p className="mb-2 font-semibold text-zinc-800">{score.name}</p>
                <dl className="flex flex-col gap-1">
                  {RATER_GROUPS.map((group) => (
                    <div key={group} className="flex justify-between gap-3">
                      <dt className="text-zinc-500">{GROUP_LABELS[group]}</dt>
                      <dd className="text-zinc-800 tabular-nums">
                        {formatScore(score.byGroup[group])}
                      </dd>
                    </div>
                  ))}
                  <div className="mt-1 flex justify-between gap-3 border-t border-zinc-100 pt-1">
                    <dt className="text-zinc-500">All raters (excl. self)</dt>
                    <dd className="font-medium text-zinc-800 tabular-nums">
                      {formatScore(score.others)}
                    </dd>
                  </div>
                </dl>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function ItemList({
  icon,
  title,
  description,
  items,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  items: ItemScore[];
}) {
  return (
    <div className={`${cardClass} flex flex-col gap-3 p-4`}>
      <div className="flex items-start gap-2">
        <span className="mt-0.5 text-zinc-500">{icon}</span>
        <SectionTitle title={title} description={description} />
      </div>
      {items.length > 0 ? (
        <ol className="flex flex-col gap-2">
          {items.map((item) => (
            <li key={item.id} className="flex items-start justify-between gap-3">
              <span className="flex flex-col">
                <span className="text-xs text-zinc-800">{item.text}</span>
                <span className="text-[11px] text-zinc-500">
                  {item.competency}
                </span>
              </span>
              <span className="text-xs font-semibold text-zinc-800 tabular-nums">
                {item.others.toFixed(1)}
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-xs text-zinc-500">Not enough responses yet.</p>
      )}
    </div>
  );
}

function GapList({
  icon,
  title,
  description,
  scores,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  scores: CompetencyScore[];
}) {
  return (
    <div className={`${cardClass} flex flex-col gap-3 p-4`}>
      <div className="flex items-start gap-2">
        <span className="mt-0.5 text-zinc-500">{icon}</span>
        <SectionTitle title={title} description={description} />
      </div>
      {scores.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {scores.map((score) => (
            <li key={score.key} className="flex justify-between gap-3 text-xs">
              <span className="text-zinc-800">{score.name}</span>
              <span className="text-zinc-600 tabular-nums">
                Self {formatScore(score.self)} · Others{" "}
                {formatScore(score.others)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-zinc-500">None found.</p>
      )}
    </div>
  );
}

export function ReviewResults({ reviewId }: ReviewResultsProps) {
  const router = useRouter();
  const { reviews, responses } = useFeedback360State();
  const review = reviews.find((item) => item.id === reviewId);

  if (!review) {
    return (
      <div className="flex flex-col items-start gap-3">
        <Link
          href="/feedback-360"
          className="inline-flex items-center gap-1 text-xs font-medium text-[#1E40AF]"
        >
          <ArrowLeft className="size-3.5" />
          360 feedback
        </Link>
        <p className="text-sm text-zinc-500">This 360 review was not found.</p>
      </div>
    );
  }

  const report = buildReport(review, responses);
  const total = report.groups.reduce((sum, group) => sum + group.count, 0);
  const hiddenGroups = report.groups.filter(
    (group) => group.count > 0 && !group.visible,
  );
  const link = feedbackLink(review.token);
  const selfComments = report.comments.some((c) => c.self.length > 0);

  function handleDelete() {
    if (
      window.confirm(
        `Delete the 360 review for ${review!.employeeName} and all its responses?`,
      )
    ) {
      deleteReview(review!.id);
      router.push("/feedback-360");
    }
  }

  return (
    <div className="flex flex-col gap-6 print:gap-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <Link
            href="/feedback-360"
            className="inline-flex items-center gap-1 text-xs font-medium text-[#1E40AF] print:hidden"
          >
            <ArrowLeft className="size-3.5" />
            360 feedback
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-semibold text-zinc-900">
              {review.employeeName}
            </h1>
            <ReviewStatusBadge status={review.status} />
          </div>
          <p className="text-xs text-zinc-500">
            {[
              review.jobTitle,
              review.department,
              `${review.id} · created ${review.createdOn}`,
              review.dueDate ? `due ${review.dueDate}` : "",
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          {review.status === "Collecting" ? (
            <>
              <CopyLinkButton link={link} />
              <button
                type="button"
                onClick={() => setReviewStatus(review.id, "Closed")}
                className="inline-flex h-9 items-center rounded-md border border-zinc-200 bg-white px-3 text-sm font-medium text-zinc-700"
              >
                Close collection
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setReviewStatus(review.id, "Collecting")}
              className="inline-flex h-9 items-center rounded-md border border-zinc-200 bg-white px-3 text-sm font-medium text-zinc-700"
            >
              Reopen collection
            </button>
          )}
          <button
            type="button"
            onClick={() => window.print()}
            disabled={total === 0}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-zinc-200 bg-white px-3 text-sm font-medium text-zinc-700 disabled:opacity-40"
          >
            <Printer className="size-4" />
            Print / PDF
          </button>
          <button
            type="button"
            onClick={handleDelete}
            className="inline-flex h-9 items-center rounded-md px-2 text-sm font-medium text-red-600 hover:bg-red-50"
          >
            Delete
          </button>
        </div>
      </div>

      {total === 0 ? (
        <div
          className={`${cardClass} flex flex-col items-center gap-3 px-6 py-14 text-center`}
        >
          <p className="text-sm font-medium text-zinc-800">
            No responses yet
          </p>
          <p className="max-w-md text-xs text-zinc-500">
            Share the anonymous link with {review.employeeName}, their manager,
            peers and direct reports. Results appear here as responses come in.
          </p>
          {review.status === "Collecting" ? (
            <div className="flex w-full max-w-lg items-center gap-2">
              <input
                readOnly
                value={link}
                onFocus={(event) => event.target.select()}
                className="h-9 min-w-0 flex-1 rounded-md border border-zinc-200 bg-white px-2 text-xs text-zinc-700 outline-none"
              />
              <CopyLinkButton link={link} />
            </div>
          ) : null}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile
              label="Overall rating from others"
              value={formatScore(report.overallOthers)}
              suffix="/ 5"
              note={
                report.othersVisible
                  ? `${report.othersCount} raters, excluding self`
                  : `Shown after ${review.anonymityThreshold} non-self responses`
              }
            />
            <StatTile
              label="Self rating"
              value={formatScore(report.overallSelf)}
              suffix="/ 5"
              note={
                report.overallSelf === null
                  ? "Self-assessment not submitted"
                  : undefined
              }
            />
            <StatTile label="Responses" value={String(total)} />
            <div className={`${cardClass} flex flex-col gap-2 p-4`}>
              <span className="text-xs text-zinc-500">By group</span>
              <ul className="flex flex-col gap-1">
                {report.groups.map((group) => (
                  <li
                    key={group.group}
                    className="flex items-center justify-between text-xs"
                  >
                    <span className="inline-flex items-center gap-1 text-zinc-700">
                      {GROUP_LABELS[group.group]}
                      {group.count > 0 && !group.visible ? (
                        <EyeOff
                          className="size-3 text-zinc-400"
                          aria-label="Hidden for anonymity"
                        />
                      ) : null}
                    </span>
                    <span className="text-zinc-800 tabular-nums">
                      {group.count}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {hiddenGroups.length > 0 ? (
            <p className="flex items-start gap-2 rounded-md bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
              <Lock className="mt-px size-3.5 shrink-0" />
              {hiddenGroups.map((g) => GROUP_LABELS[g.group]).join(", ")}{" "}
              {hiddenGroups.length === 1 ? "has" : "have"} fewer than{" "}
              {review.anonymityThreshold} responses, so{" "}
              {hiddenGroups.length === 1 ? "its" : "their"} scores are not shown
              separately. They are still counted in the all-raters score once
              that reaches {review.anonymityThreshold} responses.
            </p>
          ) : null}

          <section className={`${cardClass} flex flex-col gap-4 p-5 break-inside-avoid`}>
            <SectionTitle
              title="Competencies: self vs others"
              description="Average rating on a 1–5 scale. Hover a row for the breakdown by rater group."
            />
            <CompetencyChart scores={report.competencies} />
          </section>

          <section className="grid grid-cols-1 gap-3 lg:grid-cols-2 break-inside-avoid">
            <ItemList
              icon={<ArrowUpRight className="size-4" />}
              title="Top strengths"
              description="Highest rated behaviours by others"
              items={report.topItems}
            />
            <ItemList
              icon={<ArrowDownRight className="size-4" />}
              title="Development areas"
              description="Lowest rated behaviours by others"
              items={report.bottomItems}
            />
            <GapList
              icon={<Target className="size-4" />}
              title="Blind spots"
              description={`Self rating at least ${GAP_THRESHOLD} higher than others`}
              scores={report.blindSpots}
            />
            <GapList
              icon={<Sparkles className="size-4" />}
              title="Hidden strengths"
              description={`Others rate at least ${GAP_THRESHOLD} higher than self`}
              scores={report.hiddenStrengths}
            />
          </section>

          <section className={`${cardClass} overflow-hidden break-inside-avoid`}>
            <div className="p-4">
              <SectionTitle
                title="Scores by rater group"
                description="— means no responses, or too few to show without identifying raters."
              />
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse">
                <thead className="bg-zinc-50">
                  <tr>
                    <th
                      scope="col"
                      className="px-3 py-2.5 text-left text-xs font-semibold text-zinc-500"
                    >
                      Competency
                    </th>
                    {RATER_GROUPS.map((group) => (
                      <th
                        key={group}
                        scope="col"
                        className="px-3 py-2.5 text-right text-xs font-semibold text-zinc-500"
                      >
                        {GROUP_LABELS[group]}
                      </th>
                    ))}
                    <th
                      scope="col"
                      className="px-3 py-2.5 text-right text-xs font-semibold text-zinc-700"
                    >
                      All raters (excl. self)
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {report.competencies.map((score) => (
                    <tr key={score.key} className="border-t border-zinc-100">
                      <td className="px-3 py-2.5 text-xs whitespace-nowrap text-zinc-800">
                        {score.name}
                      </td>
                      {RATER_GROUPS.map((group) => (
                        <td
                          key={group}
                          className="px-3 py-2.5 text-right text-xs text-zinc-700 tabular-nums"
                        >
                          {formatScore(score.byGroup[group])}
                        </td>
                      ))}
                      <td className="px-3 py-2.5 text-right text-xs font-semibold text-zinc-900 tabular-nums">
                        {formatScore(score.others)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className={`${cardClass} flex flex-col gap-5 p-5`}>
            <SectionTitle
              title="Written comments"
              description="Comments from other raters are shown without attribution, in alphabetical order."
            />
            {report.comments.map((question) => (
              <div key={question.id} className="flex flex-col gap-2 break-inside-avoid">
                <h3 className="text-xs font-semibold text-zinc-700">
                  {question.text}
                </h3>
                {report.othersVisible ? (
                  question.others.length > 0 ? (
                    <ul className="flex flex-col gap-2">
                      {question.others.map((comment, index) => (
                        <li
                          key={index}
                          className="flex gap-2 rounded-md bg-zinc-50 px-3 py-2 text-xs leading-relaxed text-zinc-700"
                        >
                          <Quote className="mt-0.5 size-3 shrink-0 text-zinc-300" />
                          {comment}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-zinc-500">No comments.</p>
                  )
                ) : (
                  <p className="text-xs text-zinc-500">
                    Hidden until {review.anonymityThreshold} non-self responses
                    are received.
                  </p>
                )}
              </div>
            ))}
            {selfComments ? (
              <div className="flex flex-col gap-2 border-t border-zinc-100 pt-4 break-inside-avoid">
                <h3 className="text-xs font-semibold text-zinc-700">
                  Self-assessment comments
                </h3>
                {report.comments.flatMap((question) =>
                  question.self.map((comment, index) => (
                    <p
                      key={`${question.id}-${index}`}
                      className="rounded-md bg-orange-50/60 px-3 py-2 text-xs leading-relaxed text-zinc-700"
                    >
                      <span className="font-medium text-zinc-500">
                        {question.text.replace("this person", "I")}{" "}
                      </span>
                      {comment}
                    </p>
                  )),
                )}
              </div>
            ) : null}
          </section>
        </>
      )}
    </div>
  );
}
