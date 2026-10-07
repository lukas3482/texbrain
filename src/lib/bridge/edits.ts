// edits that go through the codemirror view, worked out on the state alone so
// the tests can run them without a page

// the smallest change that turns one text into the other, so a write to the
// open file keeps the cursor where it was and the undo step stays small
export function changeBetween(before: string, after: string): { from: number; to: number; insert: string } | null {
  if (before === after) return null;
  const max = Math.min(before.length, after.length);
  let start = 0;
  while (start < max && before.charCodeAt(start) === after.charCodeAt(start)) start++;
  let end = 0;
  while (end < max - start && before.charCodeAt(before.length - 1 - end) === after.charCodeAt(after.length - 1 - end)) end++;
  return { from: start, to: before.length - end, insert: after.slice(start, after.length - end) };
}
