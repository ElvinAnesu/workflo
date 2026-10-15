export type KpiRow = {
  id: string;
  kpiName: string;
  unit: "Number" | "%" | "Days";
  direction: "Higher is better" | "Lower is better";
  appliesTo: "Everyone" | "Assign as needed";
};
