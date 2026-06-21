import { Fragment, useCallback, useMemo, useState, type ReactElement, type ReactNode } from "react";
import { Button } from "antd";
import type { Token } from "./syntaxConfig";
import { CORE, cat, depZh, joinTokens, pillCat } from "./syntaxConfig";

// Preview text inside a collapsed pill is truncated to this many characters.
const PREVIEW_MAX = 34;

type DepGraph = {
  // subtree(i): i plus all its descendants, deduped and sorted ascending.
  subtree: (i: number) => number[];
  // skeletonSet(head): head plus every CORE descendant reachable via CORE-only edges.
  skeletonSet: (head: number) => Set<number>;
  rootIdx: number;
};

// Build the dependency graph once per `tokens`. No sentence parsing here — we
// only read the spaCy-shaped { text, dep, head } contract.
function buildGraph(tokens: Token[]): DepGraph {
  const n = tokens.length;
  const children: number[][] = Array.from({ length: n }, () => []);
  tokens.forEach((t, j) => {
    if (t.head === j) return; // ROOT points to itself — not a child edge.
    if (t.head < 0 || t.head >= n) return; // defend against malformed indices.
    children[t.head].push(j);
  });

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
  return { subtree, skeletonSet, rootIdx };
}

function WordSpan({ token }: { token: Token }): ReactElement {
  return (
    <span className={`syntax-word cat-${cat(token.dep)}`} title={`${depZh(token.dep)} (${token.dep})`}>
      {token.text}
    </span>
  );
}

export default function SentenceStructure({ tokens }: { tokens: Token[] }): ReactElement {
  // expanded = set of head indices currently shown expanded (the React stand-in
  // for the reference's replaceWith DOM swap).
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set());

  // Reset expansion when the sentence changes (indices are tokens-specific).
  const [prevTokens, setPrevTokens] = useState<Token[]>(tokens);
  if (prevTokens !== tokens) {
    setPrevTokens(tokens);
    setExpanded(new Set());
  }

  const { subtree, skeletonSet, rootIdx } = useMemo(() => buildGraph(tokens), [tokens]);

  const expand = useCallback((m: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.add(m);
      return next;
    });
  }, []);

  // Collapsing drops m and its whole subtree, so re-expanding starts fresh —
  // matching the reference, where replaceWith discarded the nested DOM.
  const collapse = useCallback(
    (m: number) => {
      setExpanded((prev) => {
        const next = new Set(prev);
        for (const i of subtree(m)) next.delete(i);
        return next;
      });
    },
    [subtree]
  );

  // Every non-CORE token is exactly one clause's collapsible pill, so expanding
  // all of them reveals the sentence down to the leaves.
  const expandAll = useCallback(() => {
    const all = new Set<number>();
    tokens.forEach((t, i) => {
      if (!CORE.has(t.dep)) all.add(i);
    });
    setExpanded(all);
  }, [tokens]);

  const collapseAll = useCallback(() => setExpanded(new Set()), []);

  type Unit =
    | { kind: "word"; idx: number; sort: number }
    | { kind: "chip"; head: number; sort: number };

  function renderClause(head: number): ReactNode {
    const skel = skeletonSet(head);
    // A trigger is a non-CORE token whose head sits in this clause's skeleton;
    // its whole subtree collapses into one pill.
    const triggers = subtree(head).filter(
      (m) => m !== head && skel.has(tokens[m].head) && !CORE.has(tokens[m].dep)
    );

    const units: Unit[] = [];
    skel.forEach((idx) => units.push({ kind: "word", idx, sort: idx }));
    triggers.forEach((m) => units.push({ kind: "chip", head: m, sort: subtree(m)[0] }));
    units.sort((a, b) => a.sort - b.sort);

    return units.map((u, k) => {
      // One space after each unit, unless the next unit is a punctuation word
      // (so commas/periods hug the preceding token).
      const next = units[k + 1];
      const space = next && !(next.kind === "word" && tokens[next.idx].dep === "punct") ? " " : "";

      if (u.kind === "word") {
        return (
          <Fragment key={`w${u.idx}`}>
            <WordSpan token={tokens[u.idx]} />
            {space}
          </Fragment>
        );
      }

      const m = u.head;
      const dep = tokens[m].dep;
      const pc = pillCat(dep);

      if (expanded.has(m)) {
        return (
          <Fragment key={`c${m}`}>
            <span className={`syntax-group cat-${pc}`}>
              {renderClause(m)}
              <button
                type="button"
                className="syntax-close"
                aria-label={`收合 ${depZh(dep)}`}
                onClick={() => collapse(m)}
              >
                － {depZh(dep)} ✕
              </button>
            </span>
            {space}
          </Fragment>
        );
      }

      const full = joinTokens(subtree(m).map((i) => tokens[i].text));
      const preview = full.length > PREVIEW_MAX ? `${full.slice(0, PREVIEW_MAX - 2)}…` : full;

      return (
        <Fragment key={`c${m}`}>
          <button
            type="button"
            className={`syntax-pill cat-${pc}`}
            aria-expanded={false}
            onClick={() => expand(m)}
          >
            <span className="syntax-pill__dep">＋ {depZh(dep)}</span>
            <span className="syntax-pill__preview">{preview}</span>
          </button>
          {space}
        </Fragment>
      );
    });
  }

  // Degrade gracefully if there is no ROOT (or no tokens): show the words flat
  // with their colors rather than throwing.
  if (tokens.length === 0) {
    return <div className="syntax-skel" />;
  }
  if (rootIdx < 0) {
    return (
      <div className="syntax-skel">
        {tokens.map((t, i) => {
          const next = tokens[i + 1];
          const space = i < tokens.length - 1 && !(next && next.dep === "punct") ? " " : "";
          return (
            <Fragment key={`w${i}`}>
              <WordSpan token={t} />
              {space}
            </Fragment>
          );
        })}
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3 flex gap-2">
        <Button size="small" onClick={expandAll}>
          全部展開
        </Button>
        <Button size="small" onClick={collapseAll}>
          只看主幹
        </Button>
      </div>
      <div className="syntax-skel">{renderClause(rootIdx)}</div>
    </div>
  );
}
