import {
  competenciesFor,
  OPEN_QUESTIONS,
} from "@/components/feedback-360/feedback-360-questions";
import {
  RATER_GROUPS,
  type FeedbackResponse,
  type FeedbackReview,
  type RaterGroup,
} from "@/components/feedback-360/feedback-360.types";

// Self vs others gap (on the 1–5 scale) that counts as a blind spot or a
// hidden strength.
export const GAP_THRESHOLD = 0.75;

// Groups whose answers are attributable to one known person; they are shown
// regardless of the anonymity threshold.
const ALWAYS_VISIBLE: RaterGroup[] = ["Self", "Manager"];

export type GroupSummary = {
  group: RaterGroup;
  count: number;
  visible: boolean;
};

export type CompetencyScore = {
  key: string;
  name: string;
  self: number | null;
  others: number | null;
  byGroup: Record<RaterGroup, number | null>;
};

export type ItemScore = {
  id: string;
  text: string;
  competency: string;
  others: number;
};

export type Feedback360Report = {
  groups: GroupSummary[];
  othersCount: number;
  othersVisible: boolean;
  overallOthers: number | null;
  overallSelf: number | null;
  competencies: CompetencyScore[];
  blindSpots: CompetencyScore[];
  hiddenStrengths: CompetencyScore[];
  topItems: ItemScore[];
  bottomItems: ItemScore[];
  comments: { id: string; text: string; self: string[]; others: string[] }[];
};

function average(values: (number | null | undefined)[]) {
  const numbers = values.filter(
    (value): value is number => typeof value === "number",
  );
  return numbers.length > 0
    ? numbers.reduce((sum, value) => sum + value, 0) / numbers.length
    : null;
}

export function formatScore(value: number | null) {
  return value === null ? "—" : value.toFixed(1);
}

export function buildReport(
  review: FeedbackReview,
  allResponses: FeedbackResponse[],
): Feedback360Report {
  const responses = allResponses.filter(
    (response) => response.reviewId === review.id,
  );
  const threshold = Math.max(1, review.anonymityThreshold);
  const selfResponses = responses.filter((r) => r.group === "Self");
  const otherResponses = responses.filter((r) => r.group !== "Self");
  const othersVisible = otherResponses.length >= threshold;

  const groups: GroupSummary[] = RATER_GROUPS.map((group) => {
    const count = responses.filter((r) => r.group === group).length;
    return {
      group,
      count,
      visible:
        count > 0 && (ALWAYS_VISIBLE.includes(group) || count >= threshold),
    };
  });
  const visibleGroups = new Set(
    groups.filter((item) => item.visible).map((item) => item.group),
  );

  const competencies = competenciesFor(review.competencyKeys);
  const questionIds = competencies.flatMap((c) => c.questions.map((q) => q.id));

  const competencyScores: CompetencyScore[] = competencies.map((competency) => {
    const ids = competency.questions.map((question) => question.id);
    const scoreFor = (subset: FeedbackResponse[]) =>
      average(subset.flatMap((r) => ids.map((id) => r.ratings[id])));

    const byGroup = Object.fromEntries(
      RATER_GROUPS.map((group) => [
        group,
        visibleGroups.has(group)
          ? scoreFor(responses.filter((r) => r.group === group))
          : null,
      ]),
    ) as Record<RaterGroup, number | null>;

    return {
      key: competency.key,
      name: competency.name,
      self: scoreFor(selfResponses),
      others: othersVisible ? scoreFor(otherResponses) : null,
      byGroup,
    };
  });

  const comparable = competencyScores.filter(
    (score) => score.self !== null && score.others !== null,
  );
  const blindSpots = comparable.filter(
    (score) => score.self! - score.others! >= GAP_THRESHOLD,
  );
  const hiddenStrengths = comparable.filter(
    (score) => score.others! - score.self! >= GAP_THRESHOLD,
  );

  const itemScores: ItemScore[] = othersVisible
    ? competencies
        .flatMap((competency) =>
          competency.questions.map((question) => ({
            id: question.id,
            text: question.text,
            competency: competency.name,
            others: average(otherResponses.map((r) => r.ratings[question.id])),
          })),
        )
        .filter((item): item is ItemScore => item.others !== null)
        .sort((a, b) => b.others - a.others)
    : [];
  const listSize = Math.min(3, Math.floor(itemScores.length / 2));

  // Comments are sorted rather than kept in submission order so their order
  // cannot be matched against who responded when.
  const comments = OPEN_QUESTIONS.map((question) => ({
    id: question.id,
    text: question.text,
    self: selfResponses
      .map((r) => r.comments[question.id]?.trim())
      .filter((text): text is string => Boolean(text)),
    others: othersVisible
      ? otherResponses
          .map((r) => r.comments[question.id]?.trim())
          .filter((text): text is string => Boolean(text))
          .sort((a, b) => a.localeCompare(b))
      : [],
  }));

  return {
    groups,
    othersCount: otherResponses.length,
    othersVisible,
    overallOthers: othersVisible
      ? average(
          otherResponses.flatMap((r) => questionIds.map((id) => r.ratings[id])),
        )
      : null,
    overallSelf: average(
      selfResponses.flatMap((r) => questionIds.map((id) => r.ratings[id])),
    ),
    competencies: competencyScores,
    blindSpots,
    hiddenStrengths,
    topItems: itemScores.slice(0, listSize),
    bottomItems: listSize > 0 ? itemScores.slice(-listSize).reverse() : [],
    comments,
  };
}
