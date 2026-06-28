import type { Token } from "./syntaxConfig";
import { CORE } from "./syntaxConfig";

// Parse → tree, no rendering. Builds the dependency graph once per `tokens`,
// reading only the spaCy-shaped { text, dep, head } contract. The render layer
// (SentenceSkeleton) imports these tools instead of owning the graph logic.

export type DepTree = {
  // childrenOf(i): direct dependents of i (the ROOT self-edge is not a child).
  childrenOf: (i: number) => number[];
  // subtree(i): i plus all its descendants, deduped and sorted ascending.
  subtree: (i: number) => number[];
  // skeletonSet(head): head plus every CORE descendant reachable via CORE-only edges.
  skeletonSet: (head: number) => Set<number>;
  // Index of the ROOT token, or -1 if the parse has none.
  rootIdx: number;
};

export function buildDepTree(tokens: Token[]): DepTree {
  const n = tokens.length;
  const children: number[][] = Array.from({ length: n }, () => []);
  tokens.forEach((t, j) => {
    if (t.head === j) return; // ROOT points to itself — not a child edge.
    if (t.head < 0 || t.head >= n) return; // defend against malformed indices.
    children[t.head].push(j);
  });

  const childrenOf = (i: number): number[] => children[i] ?? [];

  const memo = new Map<number, number[]>();
  function subtree(i: number): number[] {
    const cached = memo.get(i);
    if (cached) return cached;
    const out: number[] = [];
    const seen = new Set<number>();
    const stack = [i];
    while (stack.length) {
      const cur = stack.pop() as number;
      if (seen.has(cur)) continue; // guard against cycles in malformed input.
      seen.add(cur);
      out.push(cur);
      for (const c of children[cur]) stack.push(c);
    }
    const sorted = out.sort((a, b) => a - b);
    memo.set(i, sorted);
    return sorted;
  }

  function skeletonSet(head: number): Set<number> {
    const set = new Set<number>([head]);
    const queue = [head];
    while (queue.length) {
      const h = queue.shift() as number;
      for (const c of children[h]) {
        if (CORE.has(tokens[c].dep) && !set.has(c)) {
          set.add(c);
          queue.push(c);
        }
      }
    }
    return set;
  }

  const rootIdx = tokens.findIndex((t) => t.dep === "ROOT");
  return { childrenOf, subtree, skeletonSet, rootIdx };
}
