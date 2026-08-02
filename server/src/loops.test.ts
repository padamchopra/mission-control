import assert from "node:assert/strict";
import test from "node:test";
import { nextLoopRun, type LoopSchedule } from "./loop-schedule.js";

function localDate(year: number, month: number, day: number, hour: number, minute = 0): number {
  return new Date(year, month, day, hour, minute, 0, 0).getTime();
}

test("hourly loops advance by their configured interval", () => {
  const after = localDate(2026, 6, 6, 9, 15);
  assert.equal(
    nextLoopRun({ frequency: "hourly", intervalHours: 3 }, after),
    after + 3 * 60 * 60 * 1000,
  );
});

test("daily loops choose the next matching wall-clock time", () => {
  const schedule: LoopSchedule = { frequency: "daily", hour: 9, minute: 30 };
  assert.equal(
    nextLoopRun(schedule, localDate(2026, 6, 6, 8, 0)),
    localDate(2026, 6, 6, 9, 30),
  );
  assert.equal(
    nextLoopRun(schedule, localDate(2026, 6, 6, 10, 0)),
    localDate(2026, 6, 7, 9, 30),
  );
});

test("weekday loops skip Saturday and Sunday", () => {
  const fridayAfterRun = localDate(2026, 6, 3, 10, 0);
  assert.equal(
    nextLoopRun({ frequency: "weekdays", hour: 9, minute: 0 }, fridayAfterRun),
    localDate(2026, 6, 6, 9, 0),
  );
});

test("weekly loops choose the requested JavaScript weekday", () => {
  const wednesday = localDate(2026, 6, 8, 12, 0);
  assert.equal(
    nextLoopRun({ frequency: "weekly", weekday: 1, hour: 7, minute: 45 }, wednesday),
    localDate(2026, 6, 13, 7, 45),
  );
});
