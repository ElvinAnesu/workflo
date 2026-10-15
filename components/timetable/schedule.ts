import type { TimetableRow } from "./timetable.types.ts";

const WEEKDAY_BY_INDEX = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export function weekdayOf(isoDate: string) {
  const [year, month, day] = isoDate.split("-").map(Number);
  return WEEKDAY_BY_INDEX[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
}

// Employees scheduled on a shift for a date: weekly entries for that weekday
// plus any date overrides for that exact date.
export function scheduledEmployeeIds(
  timetable: TimetableRow[],
  shiftId: string,
  isoDate: string,
) {
  const weekday = weekdayOf(isoDate);
  const ids = new Set<string>();

  for (const entry of timetable) {
    if (entry.shiftId !== shiftId) {
      continue;
    }
    const applies =
      entry.pattern === "weekly" ? entry.weekdays.includes(weekday) : entry.date === isoDate;
    if (applies) {
      entry.employeeIds.forEach((id) => ids.add(id));
    }
  }

  return [...ids];
}
