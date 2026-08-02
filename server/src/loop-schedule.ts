export type LoopFrequency = "hourly" | "daily" | "weekdays" | "weekly";

export interface LoopSchedule {
  frequency: LoopFrequency;
  intervalHours?: number;
  hour?: number;
  minute?: number;
  /** JavaScript weekday: Sunday = 0, Monday = 1. */
  weekday?: number;
}

export function nextLoopRun(schedule: LoopSchedule, after: number): number {
  if (schedule.frequency === "hourly") {
    return after + (schedule.intervalHours ?? 1) * 60 * 60 * 1000;
  }

  const candidate = new Date(after + 60_000);
  candidate.setSeconds(0, 0);
  for (let offset = 0; offset < 15 * 24 * 60; offset += 1) {
    const day = candidate.getDay();
    const atTime = candidate.getHours() === (schedule.hour ?? 0) && candidate.getMinutes() === (schedule.minute ?? 0);
    const onDay = schedule.frequency === "daily"
      || (schedule.frequency === "weekdays" && day >= 1 && day <= 5)
      || (schedule.frequency === "weekly" && day === (schedule.weekday ?? 0));
    if (atTime && onDay) return candidate.getTime();
    candidate.setMinutes(candidate.getMinutes() + 1);
  }
  throw new Error("could not calculate next loop run");
}
