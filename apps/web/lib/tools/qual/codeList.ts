/**
 * Whether a stored code list cannot be walked: some code is its own parent, or the parents loop. core's qualDescendantIds (and so qualDeleteCascade)
 * recurse from a code to the codes whose parentId is its id with no cycle guard, as v1's do, so on such a list they recurse until the stack overflows.
 * v1's own prompts never make one, but a stored or imported list can hold one, so the panel asks this before every call to either, and before it draws the tree.
 *
 * The check walks the same edges the recursion does (an id to the ids of the codes whose parentId it is), so a loop that only exists through a
 * duplicated id is found too. Iterative, so a very long chain cannot overflow the stack here either. A code whose parent is missing is not a loop (v1 never reaches it).
 */
export function codeListDamaged(codes: ReadonlyArray<{ id: string; parentId: string | null }>): boolean {
  const kids = new Map<string, string[]>();
  for (const c of codes) {
    if (c.parentId === null) continue;
    const l = kids.get(c.parentId);
    if (l) l.push(c.id); else kids.set(c.parentId, [c.id]);
  }
  // 1: on the walk now, 2: walked to the end.
  const state = new Map<string, 1 | 2>();
  for (const start of kids.keys()) {
    if (state.has(start)) continue;
    state.set(start, 1);
    const stack: Array<{ id: string; next: number }> = [{ id: start, next: 0 }];
    while (stack.length) {
      const top = stack[stack.length - 1]!;
      const children = kids.get(top.id) ?? [];
      if (top.next >= children.length) { state.set(top.id, 2); stack.pop(); continue; }
      const child = children[top.next++]!;
      const s = state.get(child);
      if (s === 1) return true;
      if (s === 2) continue;
      state.set(child, 1);
      stack.push({ id: child, next: 0 });
    }
  }
  return false;
}
