/** v1 selUpdate: the bubble shows for 8 to 800 characters of selected text (trimmed). */
export const SEL_MIN = 8;
export const SEL_MAX = 800;

export function selBubbleVisible({ empty, text }: { empty: boolean; text: string }): boolean {
  if (empty) return false;
  const n = text.trim().length;
  return n >= SEL_MIN && n <= SEL_MAX;
}
