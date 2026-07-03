import {
  Fragment,
  useState,
  type ReactElement,
  type ReactNode,
  type SyntheticEvent,
} from "react";
import { Button, Tooltip } from "antd";
import type { StructureNode, StructureRole } from "../../types";
import { PATTERN_ZH, SLOT_ZH, isCoreSlot, roleCategory } from "./syntaxConfig";

type SentenceSkeletonProps = {
  structure: StructureNode;
  // Leading words shown in a collapsed block's preview before truncating. Default 3.
  previewWords?: number;
};

// A word is part of an underlined S/V/O/C run only when it is a leaf word filling
// a core clause slot; everything else breaks the run.
function slotRole(node: StructureNode): StructureRole | null {
  return node.type === "word" && isCoreSlot(node.role) ? node.role : null;
}

// First `previewWords` words + " …"; short spans show in full.
function previewText(node: StructureNode, previewWords: number): string {
  const words = node.text.split(/\s+/).filter(Boolean);
  if (words.length <= previewWords + 1) return node.text;
  return `${words.slice(0, previewWords).join(" ")} …`;
}

// Path-based identity for a node (its position in the tree), used as the stable
// key for React and for tracking which blocks are expanded.
function childPath(path: string, i: number): string {
  return `${path}.${i}`;
}

// Every expandable block's path (a non-word node that has children), for 全部展開.
function collectBlockPaths(node: StructureNode, path: string, acc: string[]): void {
  (node.children ?? []).forEach((child, i) => {
    const cp = childPath(path, i);
    if (child.type !== "word" && child.children && child.children.length > 0) {
      acc.push(cp);
    }
    collectBlockPaths(child, cp, acc);
  });
}

// A single word. The main verb (top-level V) is bold; punctuation is muted.
function Word({ node, root }: { node: StructureNode; root: boolean }): ReactElement {
  const cls = ["syntax-word"];
  if (root) cls.push("syntax-word--root");
  if (node.role === "PUNCT") cls.push("syntax-word--muted");
  return (
    <span className={cls.join(" ")} title={node.label}>
      {node.text}
    </span>
  );
}

const ROOT_PATH = "r";

export default function SentenceSkeleton({
  structure,
  previewWords = 3,
}: SentenceSkeletonProps): ReactElement {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  // Reset expansion when the analyzed sentence changes.
  const [prev, setPrev] = useState(structure);
  if (prev !== structure) {
    setPrev(structure);
    setExpanded(new Set());
  }

  const expandAll = (): void => {
    const paths: string[] = [];
    collectBlockPaths(structure, ROOT_PATH, paths);
    setExpanded(new Set(paths));
  };
  const collapseAll = (): void => setExpanded(new Set());

  const toggle = (path: string) => (e: SyntheticEvent): void => {
    e.stopPropagation(); // a nested block must not toggle its parent
    setExpanded((prevSet) => {
      const next = new Set(prevSet);
      // Collapsing a block also collapses everything nested inside it.
      if (next.has(path)) {
        for (const p of next) if (p === path || p.startsWith(`${path}.`)) next.delete(p);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  // No space before a following punctuation word.
  function spaceAfter(next?: StructureNode): string {
    return next && !(next.type === "word" && next.role === "PUNCT") ? " " : "";
  }

  function renderChip(node: StructureNode, path: string, depth: number): ReactElement {
    const category = roleCategory(node.role);
    const expandable = !!node.children && node.children.length > 0;
    const open = expandable && expanded.has(path);
    const boxDepth = Math.min(depth, 2); // depth ≥ 2 all share the dashed style
    const labelText = isCoreSlot(node.role) ? `${node.label}（${node.role}）` : node.label;

    return (
      <span
        role={expandable ? "button" : undefined}
        tabIndex={expandable ? 0 : undefined}
        aria-expanded={expandable ? open : undefined}
        className={`skel-box skel-box--d${boxDepth} cat-${category}`}
        onClick={expandable ? toggle(path) : undefined}
        onKeyDown={
          expandable
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  toggle(path)(e);
                }
              }
            : undefined
        }
      >
        <span className="skel-box__content">
          {open ? (
            renderSequence(node.children as StructureNode[], path, depth + 1)
          ) : (
            <span className="skel-box__preview">{previewText(node, previewWords)}</span>
          )}
        </span>
        <span className={`skel-box__label cat-${category}`}>
          {node.pattern && (
            <Tooltip title={`句型：${PATTERN_ZH[node.pattern]}`}>
              <span className="pattern-badge pattern-badge--sm">{node.pattern}</span>
            </Tooltip>
          )}
          {labelText}
        </span>
      </span>
    );
  }

  function renderUnit(node: StructureNode, path: string, depth: number): ReactNode {
    return node.type === "word" ? (
      <Word node={node} root={depth === 0 && node.role === "V"} />
    ) : (
      renderChip(node, path, depth)
    );
  }

  // Render a clause/phrase's children as an inline sequence, collapsing adjacent
  // same-slot leaf words under one S/V/O/C underline.
  function renderSequence(nodes: StructureNode[], path: string, depth: number): ReactNode {
    const out: ReactNode[] = [];
    let i = 0;
    while (i < nodes.length) {
      const role = slotRole(nodes[i]);
      if (!role) {
        out.push(
          <Fragment key={childPath(path, i)}>
            {renderUnit(nodes[i], childPath(path, i), depth)}
            {spaceAfter(nodes[i + 1])}
          </Fragment>,
        );
        i += 1;
        continue;
      }
      const start = i;
      const inner: ReactNode[] = [];
      while (i < nodes.length && slotRole(nodes[i]) === role) {
        const sameNext = i + 1 < nodes.length && slotRole(nodes[i + 1]) === role;
        inner.push(
          <Fragment key={childPath(path, i)}>
            <Word node={nodes[i]} root={depth === 0 && role === "V"} />
            {sameNext ? spaceAfter(nodes[i + 1]) : ""}
          </Fragment>,
        );
        i += 1;
      }
      out.push(
        <Fragment key={`g${childPath(path, start)}`}>
          <span className={`slot-group slot-${role}`}>
            <span className="slot-group__words">{inner}</span>
            <Tooltip title={SLOT_ZH[role]}>
              <span className="slot-group__label">{role}</span>
            </Tooltip>
          </span>
          {spaceAfter(nodes[i])}
        </Fragment>,
      );
    }
    return out;
  }

  const children = structure.children ?? [];

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        {structure.pattern && (
          <Tooltip title={`主要子句句型：${PATTERN_ZH[structure.pattern]}`}>
            <span className="pattern-badge">{structure.pattern}</span>
          </Tooltip>
        )}
        <span className="flex gap-2 no-print">
          <Button size="small" onClick={expandAll}>
            全部展開
          </Button>
          <Button size="small" onClick={collapseAll}>
            只看主幹
          </Button>
        </span>
      </div>
      <div className="syntax-skel syntax-skel--slotted">
        {renderSequence(children, ROOT_PATH, 0)}
      </div>
    </div>
  );
}
