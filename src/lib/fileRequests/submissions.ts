interface NotedSubmission {
  message: string | null;
  uploader_name: string;
  uploader_email: string;
}

/**
 * Submissions grouped under the note that came with them.
 *
 * The upload page sends the client's note along with every file in the batch,
 * so sixteen files sent with one note are sixteen rows carrying it. Next to
 * each other, from the same sender, with the same note, they are one batch,
 * and the note is shown once above it instead of on every row.
 */
export function groupByNote<T extends NotedSubmission>(rows: T[]) {
  const groups: { note: string | null; rows: T[] }[] = [];
  for (const row of rows) {
    const note = row.message?.trim() || null;
    const last = groups[groups.length - 1];
    const sameBatch =
      last &&
      last.note === note &&
      last.rows[0].uploader_name === row.uploader_name &&
      last.rows[0].uploader_email === row.uploader_email;
    if (sameBatch) last.rows.push(row);
    else groups.push({ note, rows: [row] });
  }
  return groups;
}
