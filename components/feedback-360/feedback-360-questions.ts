export type Competency = {
  key: string;
  name: string;
  description: string;
  questions: { id: string; text: string }[];
};

export const COMPETENCIES: Competency[] = [
  {
    key: "communication",
    name: "Communication",
    description: "Shares information clearly and listens well.",
    questions: [
      { id: "communication-1", text: "Communicates ideas clearly and concisely." },
      { id: "communication-2", text: "Listens actively and considers other viewpoints." },
    ],
  },
  {
    key: "teamwork",
    name: "Teamwork",
    description: "Works well with others toward shared goals.",
    questions: [
      { id: "teamwork-1", text: "Collaborates willingly and supports colleagues." },
      { id: "teamwork-2", text: "Handles disagreement constructively." },
    ],
  },
  {
    key: "accountability",
    name: "Accountability",
    description: "Owns commitments and delivers on them.",
    questions: [
      { id: "accountability-1", text: "Delivers on commitments and meets deadlines." },
      { id: "accountability-2", text: "Takes ownership of mistakes and learns from them." },
    ],
  },
  {
    key: "problem-solving",
    name: "Problem solving",
    description: "Analyses issues and finds practical solutions.",
    questions: [
      { id: "problem-solving-1", text: "Identifies the root cause of problems." },
      { id: "problem-solving-2", text: "Makes sound decisions with the information available." },
    ],
  },
  {
    key: "customer-focus",
    name: "Customer focus",
    description: "Understands and serves internal and external customers.",
    questions: [
      { id: "customer-focus-1", text: "Understands what customers need and responds promptly." },
      { id: "customer-focus-2", text: "Follows through until customer issues are resolved." },
    ],
  },
  {
    key: "leadership",
    name: "Leadership",
    description: "Sets direction and develops people.",
    questions: [
      { id: "leadership-1", text: "Sets clear expectations and direction." },
      { id: "leadership-2", text: "Gives useful feedback and helps others grow." },
    ],
  },
  {
    key: "integrity",
    name: "Integrity",
    description: "Acts honestly and consistently with company values.",
    questions: [
      { id: "integrity-1", text: "Is honest and transparent in dealings with others." },
      { id: "integrity-2", text: "Treats people fairly and with respect." },
    ],
  },
];

export const DEFAULT_COMPETENCY_KEYS = [
  "communication",
  "teamwork",
  "accountability",
  "problem-solving",
  "customer-focus",
];

export const OPEN_QUESTIONS = [
  { id: "keep-doing", text: "What should this person keep doing?" },
  { id: "do-better", text: "What could this person do better or differently?" },
];

export const RATING_SCALE = [
  { value: 1, label: "Needs significant improvement" },
  { value: 2, label: "Needs some improvement" },
  { value: 3, label: "Meets expectations" },
  { value: 4, label: "Exceeds expectations" },
  { value: 5, label: "Outstanding" },
];

export function competenciesFor(keys: string[]) {
  return COMPETENCIES.filter((competency) => keys.includes(competency.key));
}
