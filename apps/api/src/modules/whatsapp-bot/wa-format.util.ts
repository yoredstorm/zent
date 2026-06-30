const KEYCAPS: Record<number, string> = {
  1: '1️⃣',
  2: '2️⃣',
  3: '3️⃣',
  4: '4️⃣',
  5: '5️⃣',
  6: '6️⃣',
  7: '7️⃣',
  8: '8️⃣',
  9: '9️⃣',
  10: '🔟',
};

/** 1→1️⃣ … 9→9️⃣, 10→🔟, 11+→"11." */
export function formatKeycap(n: number): string {
  return KEYCAPS[n] ?? `${n}.`;
}
