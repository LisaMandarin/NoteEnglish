import {
  Fragment,
  useState,
  type ReactElement,
  type ReactNode,
  type SyntheticEvent,
} from "react";
import { Button, Tooltip } from "antd";
import type { Token } from "./syntaxConfig";
import { cat, depZh } from "./syntaxConfig";
import { SLOT_ZH, PATTERN_ZH } from "./sentencePattern";
import { useSentenceTree, type BlockNode, type SkeletonNode, type WordNode } from "./useSentenceTree";

type SentenceSkeletonProps = {
  tokens: Token[];
  // 收合方塊預覽的開頭葉子詞數，預設 3。
  previewWords?: number;
  // 後端判斷此句依存解析可能不準（主幹非動詞）時為 false，顯示提示。預設 true。
  reliable?: boolean;
};

// 主幹詞一律中性主色（角色色彩交給 S/V/O/C 底線承擔，避免雙重上色），
// 僅 ROOT 主要動詞加粗、標點淡化；方塊內的詞同樣中性（neutral）。
function Word({ node, neutral }: { node: WordNode; neutral: boolean }): ReactElement {
  if (neutral) {
    return (
      <span className="skel-word-neutral" title={`${node.token.text} · ${node.token.dep}`}>
        {node.token.text}
      </span>
    );
  }
  const cls = ["syntax-word"];
  if (node.isRoot) cls.push("syntax-word--root");
  if (node.token.dep === "punct") cls.push("syntax-word--muted");
  return (
    <span className={cls.join(" ")} title={`${node.token.text} · ${node.token.dep}`}>
      {node.token.text}
    </span>
  );
}

// 骨架單元所屬的五大句型成分；只有主幹詞會帶成分，收合方塊（後位修飾等）
// 不納入底線標註，回傳 undefined 以中斷成分段落。
function slotOf(node: SkeletonNode): WordNode["slot"] {
  return node.kind === "word" ? node.slot : undefined;
}

// 節點的穩定 key（詞用 token 索引、方塊用其 head 索引）。
function nodeKey(node: SkeletonNode): string {
  return node.kind === "word" ? `w${node.idx}` : `b${node.head}`;
}

// 骨架摺疊（行內）：可摺疊子樹做成方塊，依巢狀深度換樣式（0 實心 / 1 實線框 / ≥2 虛線框），
// 成分標籤墊在方塊下方。點擊就地攤開，子方塊以 depth+1 樣式遞迴呈現。
export default function SentenceSkeleton({
  tokens,
  previewWords = 3,
  reliable = true,
}: SentenceSkeletonProps): ReactElement {
  const data = useSentenceTree(tokens, previewWords);

  const [expanded, setExpanded] = useState<Set<number>>(() => new Set());

  // data 隨 tokens 換 identity（useMemo），換句時重置展開狀態。
  const [prevData, setPrevData] = useState(data);
  if (prevData !== data) {
    setPrevData(data);
    setExpanded(new Set());
  }

  const expandAll = (): void => setExpanded(new Set(data.blocks.map((b) => b.head)));
  const collapseAll = (): void => setExpanded(new Set());

  // 收合時連同子樹一併移除，再展開時從預覽重新開始（對齊原型 replaceWith 行為）。
  const toggle = (block: BlockNode) => (e: SyntheticEvent): void => {
    e.stopPropagation(); // 子方塊不可連帶觸發父層
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(block.head)) {
        for (const i of data.tree.subtree(block.head)) next.delete(i);
      } else {
        next.add(block.head);
      }
      return next;
    });
  };

  // 單元後是否補空白：下一個單元是 punct 詞時不補。
  function spaceAfter(next?: SkeletonNode): string {
    return next && !(next.kind === "word" && next.token.dep === "punct") ? " " : "";
  }

  function renderUnit(node: SkeletonNode, neutral: boolean): ReactNode {
    return node.kind === "word" ? <Word node={node} neutral={neutral} /> : renderBlock(node);
  }

  // 方塊展開後的子內容：平鋪渲染，不做句型底線（成分只標主要子句最外層）。
  function renderNodes(nodes: SkeletonNode[], neutral: boolean): ReactNode {
    return nodes.map((node, k) => (
      <Fragment key={nodeKey(node)}>
        {renderUnit(node, neutral)}
        {spaceAfter(nodes[k + 1])}
      </Fragment>
    ));
  }

  // 主要子句最外層：把相鄰且同成分的單元收進一條底線下，下方置中標 S/V/O/C。
  function renderTopLevel(nodes: SkeletonNode[]): ReactNode {
    const out: ReactNode[] = [];
    let i = 0;
    while (i < nodes.length) {
      const slot = slotOf(nodes[i]);
      if (!slot) {
        out.push(
          <Fragment key={nodeKey(nodes[i])}>
            {renderUnit(nodes[i], false)}
            {spaceAfter(nodes[i + 1])}
          </Fragment>,
        );
        i += 1;
        continue;
      }
      // 收集相鄰且成分相同的單元成一段。
      const start = i;
      const inner: ReactNode[] = [];
      while (i < nodes.length && slotOf(nodes[i]) === slot) {
        const sameNext = i + 1 < nodes.length && slotOf(nodes[i + 1]) === slot;
        inner.push(
          <Fragment key={nodeKey(nodes[i])}>
            {renderUnit(nodes[i], false)}
            {sameNext ? spaceAfter(nodes[i + 1]) : ""}
          </Fragment>,
        );
        i += 1;
      }
      out.push(
        <Fragment key={`g${start}`}>
          <span className={`slot-group slot-${slot}`}>
            <span className="slot-group__words">{inner}</span>
            <Tooltip title={`${SLOT_ZH[slot]}`}>
              <span className="slot-group__label">{slot}</span>
            </Tooltip>
          </span>
          {spaceAfter(nodes[i])}
        </Fragment>,
      );
    }
    return out;
  }

  function renderBlock(block: BlockNode): ReactElement {
    const open = expanded.has(block.head);
    const depth = Math.min(block.depth, 2); // 深度上限 2，更深沿用虛線
    return (
      <span
        role="button"
        tabIndex={0}
        aria-expanded={open}
        className={`skel-box skel-box--d${depth} cat-${block.category}`}
        onClick={toggle(block)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            toggle(block)(e);
          }
        }}
      >
        <span className="skel-box__content">
          {open ? (
            renderNodes(block.children, true)
          ) : (
            <span className="skel-box__preview">{block.preview}</span>
          )}
        </span>
        <span className={`skel-box__label cat-${block.category}`}>{block.label}</span>
      </span>
    );
  }

  if (tokens.length === 0) return <div className="syntax-skel" />;

  // 沒有 ROOT（解析失敗）時退化成平鋪、上色的詞，不丟例外。
  if (data.rootIdx < 0) {
    return (
      <div className="syntax-skel">
        {tokens.map((t, i) => {
          const next = tokens[i + 1];
          const space = i < tokens.length - 1 && !(next && next.dep === "punct") ? " " : "";
          return (
            <Fragment key={`w${i}`}>
              <span className={`syntax-word cat-${cat(t.dep)}`} title={`${depZh(t.dep)} (${t.dep})`}>
                {t.text}
              </span>
              {space}
            </Fragment>
          );
        })}
      </div>
    );
  }

  return (
    <div>
      {!reliable && (
        <p className="skel-warning" role="note">
          ⚠ 此句自動解析可能不準確，請對照原句判讀。
        </p>
      )}
      <div className="mb-3 flex items-center gap-2">
        {data.pattern && (
          <Tooltip title={`主要子句句型：${PATTERN_ZH[data.pattern]}`}>
            <span className="pattern-badge">{data.pattern}</span>
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
      <div className="syntax-skel syntax-skel--slotted">{renderTopLevel(data.nodes)}</div>
    </div>
  );
}
