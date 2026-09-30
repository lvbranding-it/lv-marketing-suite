import { describe, expect, it } from "vitest";
import { groupRunsByDate, runDateLabel, runGroupLabel, sortProjectsByActivity } from "./runHistory";

// A fixed "now" — Tuesday 29 September 2026, mid-afternoon, local time.
const NOW = new Date(2026, 8, 29, 15, 0);
const at = (y: number, m: number, d: number, h = 10, min = 0) => new Date(y, m - 1, d, h, min).toISOString();

describe("where a run is filed", () => {
  it.each([
    ["earlier today", at(2026, 9, 29, 9), "Today"],
    ["just after midnight today", at(2026, 9, 29, 0, 5), "Today"],
    ["late yesterday", at(2026, 9, 28, 23, 50), "Yesterday"],
    ["three days ago", at(2026, 9, 26), "This week"],
    ["six days ago", at(2026, 9, 23), "This week"],
    ["a week ago", at(2026, 9, 22), "September"],
    ["earlier this year", at(2026, 6, 4), "June"],
    ["last year", at(2025, 11, 12), "November 2025"],
  ])("files a run from %s under its heading", (_label, iso, expected) => {
    expect(runGroupLabel(iso, NOW)).toBe(expected);
  });
});

describe("the date on a run", () => {
  it("shows the time for a run made today", () => {
    expect(runDateLabel(at(2026, 9, 29, 9, 5), NOW)).toBe("9:05 am");
    expect(runDateLabel(at(2026, 9, 29, 12, 30), NOW)).toBe("12:30 pm");
    expect(runDateLabel(at(2026, 9, 29, 0, 15), NOW)).toBe("12:15 am");
  });

  it("shows the day for anything older, and the year only when it differs", () => {
    expect(runDateLabel(at(2026, 6, 4), NOW)).toBe("Jun 4");
    expect(runDateLabel(at(2025, 11, 12), NOW)).toBe("Nov 12, 2025");
  });
});

describe("grouping a project's runs", () => {
  it("puts each run under its heading and keeps their order", () => {
    const runs = [
      { id: "a", created_at: at(2026, 9, 29, 11) },
      { id: "b", created_at: at(2026, 9, 29, 8) },
      { id: "c", created_at: at(2026, 9, 28) },
      { id: "d", created_at: at(2026, 6, 4) },
      { id: "e", created_at: at(2026, 6, 1) },
      { id: "f", created_at: at(2026, 5, 28) },
    ];
    expect(groupRunsByDate(runs, NOW).map((group) => [group.label, group.runs.map((run) => run.id)])).toEqual([
      ["Today", ["a", "b"]],
      ["Yesterday", ["c"]],
      ["June", ["d", "e"]],
      ["May", ["f"]],
    ]);
  });

  it("returns nothing for a project with no runs", () => {
    expect(groupRunsByDate([], NOW)).toEqual([]);
  });
});

describe("ordering projects", () => {
  const projects = [
    { id: "old-run", updated_at: at(2026, 9, 1) },
    { id: "no-runs-new", updated_at: at(2026, 9, 28) },
    { id: "recent-run", updated_at: at(2026, 3, 1) },
    { id: "no-runs-old", updated_at: at(2026, 2, 1) },
  ];
  const activity = {
    "old-run": { runs: 58, lastRun: at(2026, 6, 4) },
    "recent-run": { runs: 8, lastRun: at(2026, 9, 25) },
  };

  /**
   * Recency of agent work, not of any edit to the project. A project renamed
   * yesterday but untouched by an agent since June is not what someone reaching
   * for their recent work is looking for.
   */
  it("puts the most recently run projects first", () => {
    expect(sortProjectsByActivity(projects, activity).map((p) => p.id)).toEqual([
      "recent-run",
      "old-run",
      "no-runs-new",
      "no-runs-old",
    ]);
  });

  it("does not reorder the list it was given", () => {
    const before = projects.map((p) => p.id);
    sortProjectsByActivity(projects, activity);
    expect(projects.map((p) => p.id)).toEqual(before);
  });
});
