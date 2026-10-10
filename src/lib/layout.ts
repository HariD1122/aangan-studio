/** Places overlapping events side by side (like Teams/Outlook). Times are minutes from the start of the day. */
export type Timed = { startMin: number; endMin: number };
export type Placed<T> = T & { col: number; cols: number };

export function layoutOverlaps<T extends Timed>(items: T[]): Placed<T>[] {
  const sorted = [...items].sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin);
  const out: Placed<T>[] = [];
  let group: Placed<T>[] = [];
  let groupEnd = -1;
  const flush = () => {
    const cols = group.reduce((m, g) => Math.max(m, g.col + 1), 1);
    for (const g of group) g.cols = cols;
    out.push(...group);
    group = [];
  };
  const colEnds: number[] = [];
  for (const it of sorted) {
    if (group.length && it.startMin >= groupEnd) { flush(); colEnds.length = 0; groupEnd = -1; }
    let col = colEnds.findIndex((end) => end <= it.startMin);
    if (col === -1) col = colEnds.length;
    colEnds[col] = it.endMin;
    group.push({ ...it, col, cols: 1 });
    groupEnd = Math.max(groupEnd, it.endMin);
  }
  if (group.length) flush();
  return out;
}
