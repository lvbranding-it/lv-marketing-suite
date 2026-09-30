/**
 * Ordering and labelling for the Agents sidebar.
 *
 * Kept apart from the components so the date rules can be tested against a
 * fixed "now" — a label like "Yesterday" is exactly the kind of thing that is
 * right on the day it is written and wrong the week after.
 */

export interface ProjectActivity {
  runs: number;
  /** ISO timestamp of the most recent run, or null when there has been none. */
  lastRun: string | null;
}

interface HasProject {
  id: string;
  updated_at?: string | null;
}

interface HasCreatedAt {
  created_at: string;
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const SHORT_MONTHS = MONTHS.map((month) => month.slice(0, 3));

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Projects in the order someone is likely to want them: the ones with agent
 * work most recently first. Projects never run through an agent follow, newest
 * first, so a project created this morning is still easy to find.
 */
export function sortProjectsByActivity<P extends HasProject>(
  projects: P[],
  activity: Record<string, ProjectActivity>,
): P[] {
  const time = (value?: string | null) => (value ? new Date(value).getTime() : 0);
  return [...projects].sort((a, b) => {
    const aRun = time(activity[a.id]?.lastRun);
    const bRun = time(activity[b.id]?.lastRun);
    if (aRun !== bRun) return bRun - aRun;
    return time(b.updated_at) - time(a.updated_at);
  });
}

/**
 * The heading a run is filed under.
 *
 * Recent work gets words ("Today", "Yesterday", "This week"); anything older
 * gets its month, with the year only when it is not this year. The sidebar used
 * "4 months ago" on every row instead, which told fifty-eight runs apart by
 * nothing at all.
 */
export function runGroupLabel(iso: string, now = new Date()): string {
  const date = new Date(iso);
  const days = Math.round((startOfDay(now).getTime() - startOfDay(date).getTime()) / DAY_MS);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return "This week";
  const month = MONTHS[date.getMonth()];
  return date.getFullYear() === now.getFullYear() ? month : `${month} ${date.getFullYear()}`;
}

/** The date on a single run: a time for today, a day otherwise. */
export function runDateLabel(iso: string, now = new Date()): string {
  const date = new Date(iso);
  if (startOfDay(date).getTime() === startOfDay(now).getTime()) {
    const hours = date.getHours();
    const minutes = String(date.getMinutes()).padStart(2, "0");
    return `${hours % 12 || 12}:${minutes} ${hours < 12 ? "am" : "pm"}`;
  }
  const day = `${SHORT_MONTHS[date.getMonth()]} ${date.getDate()}`;
  return date.getFullYear() === now.getFullYear() ? day : `${day}, ${date.getFullYear()}`;
}

/** Runs split under their headings, keeping the order they arrived in. */
export function groupRunsByDate<R extends HasCreatedAt>(runs: R[], now = new Date()) {
  const groups: { label: string; runs: R[] }[] = [];
  for (const run of runs) {
    const label = runGroupLabel(run.created_at, now);
    const last = groups[groups.length - 1];
    if (last?.label === label) last.runs.push(run);
    else groups.push({ label, runs: [run] });
  }
  return groups;
}
