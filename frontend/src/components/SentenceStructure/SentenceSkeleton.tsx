import {
  Fragment,
  useState,
  type ReactElement,
  type ReactNode,
  type SyntheticEvent,
} from "react";
import { Button } from "antd";
import type { Token } from "./syntaxConfig";
import { cat, depZh } from "./syntaxConfig";
import { useSentenceTree, type BlockNode, type SkeletonNode, type WordNode } from "./useSentenceTree";

type SentenceSkeletonProps = {
  tokens: Token[];
  // 收合方塊預覽的開頭葉子詞數，預設 3。
  previewWords?: number;
  // 後端判斷此句依存解析可能不準（主幹非動詞）時為 false，顯示提示。預設 true。
  reliable?: boolean;
};

// 主幹詞依六色上色、ROOT 加粗；方塊內的詞改用中性主色（neutral）。
function Word({ node, neutral }: { node: WordNode; neutral: boolean }): ReactElement {
  const className = neutral ? "skel-word-neutral" : `syntax-word cat-${node.category}`;
  return (
    <span className={className} title={`${node.token.text} · ${node.token.dep}`}>
      {node.token.text}
    </span>
  );
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

  function renderNodes(nodes: SkeletonNode[], neutral: boolean): ReactNode {
    return nodes.map((node, k) => {
      const next = nodes[k + 1];
      // 標點不前置空格：下一個單元是 punct 詞時不補空白。
      const space = next && !(next.kind === "word" && next.token.dep === "punct") ? " " : "";
      return (
        <Fragment key={node.kind === "word" ? `w${node.idx}` : `b${node.head}`}>
          {node.kind === "word" ? <Word node={node} neutral={neutral} /> : renderBlock(node)}
          {space}
        </Fragment>
      );
    });
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
      <div className="mb-3 flex gap-2 no-print">
        <Button size="small" onClick={expandAll}>
          全部展開
        </Button>
        <Button size="small" onClick={collapseAll}>
          只看主幹
        </Button>
      </div>
      <div className="syntax-skel">{renderNodes(data.nodes, false)}</div>
    </div>
  );
}
