import { useMemo } from "react";
import type { DepCategory, Token } from "./syntaxConfig";
import { CORE, cat, depZh, joinTokens } from "./syntaxConfig";
import { buildDepTree, type DepTree } from "./depTree";
import { classifyPattern, type SentencePattern, type Slot } from "./sentencePattern";

// tokens → 樹 + 可摺疊子樹清單。純解析，零 render。兩種檢視模式（inline / panel）
// 都走同一棵 SkeletonNode 模型：render 層只負責「攤開 vs 預覽」的 UI，不再碰圖論。

// 主幹上的一個詞。category 帶六色身分；isRoot 讓 render 層把主要動詞加粗。
// slot：五大句型成分標記（S/V/O/C），只有 ROOT 動詞與其直接核心論元有值。
export type WordNode = {
  kind: "word";
  idx: number;
  token: Token;
  category: DepCategory;
  isRoot: boolean;
  slot?: Slot;
};

// 一個「可摺疊的修飾子樹」。children 是已完全攤開的子句內容，render 層可二選一：
// 顯示 preview（收合），或遞迴 children（展開）。depth = 巢狀深度（0 = 最外層）。
export type BlockNode = {
  kind: "block";
  head: number;
  dep: string;
  label: string; // depZh(dep)，行內小標 / 面板列標籤共用
  category: DepCategory;
  preview: string; // 開頭 previewWords 個葉子詞 + " …"，夠短則顯示完整
  depth: number;
  children: SkeletonNode[];
};

export type SkeletonNode = WordNode | BlockNode;

export type SentenceTree = {
  rootIdx: number;
  // 主要子句的五大句型（SV / SVC / SVO / SVOO / SVOC）；無 ROOT 時為 null。
  pattern: SentencePattern | null;
  // ROOT 子句的有序單元（主幹詞 + 最外層可摺疊方塊），依 token 位置排序。
  nodes: SkeletonNode[];
  // 全句所有可摺疊方塊（含巢狀）的攤平清單，供「全部展開」與面板遍歷使用。
  blocks: BlockNode[];
  // 原始樹工具的逃生口（childrenOf / subtree / skeletonSet / rootIdx）。
  tree: DepTree;
};

// 解析一次、memo 一次。資料流：tokens ─buildDepTree→ 圖 ─buildClause→ SkeletonNode 樹。
export function useSentenceTree(tokens: Token[], previewWords: number): SentenceTree {
  return useMemo(() => {
    const tree = buildDepTree(tokens);
    const { subtree, skeletonSet, rootIdx } = tree;
    const { pattern, slots } = classifyPattern(tokens, tree);
    const blocks: BlockNode[] = [];

    // 子樹開頭 previewWords 個詞 + " …"；整段 ≤ previewWords + 1 個詞時給完整內容。
    const previewText = (head: number): string => {
      const texts = subtree(head).map((i) => tokens[i].text);
      if (texts.length <= previewWords + 1) return joinTokens(texts);
      return `${joinTokens(texts.slice(0, previewWords))} …`;
    };

    // 介系詞片語的功能由它掛在哪個字（head）決定：head 是名詞 → 形容詞片語
    // （修飾名詞，the book *on the table*）；head 是動詞/形容詞 → 副詞片語
    // （修飾動作，read *on the table*）。優先看 head 的 pos，缺值時退回 dep 推斷。
    const NOMINAL_POS = new Set(["NOUN", "PROPN", "PRON", "NUM", "SYM", "X"]);
    const VERBAL_HEAD_DEPS = new Set([
      "ROOT", "advcl", "relcl", "acl", "xcomp", "ccomp", "pcomp", "parataxis", "csubj", "csubjpass",
    ]);
    const prepIsAdjectival = (m: number): boolean => {
      const head = tokens[tokens[m].head];
      if (head?.pos) return NOMINAL_POS.has(head.pos);
      return !VERBAL_HEAD_DEPS.has(head?.dep);
    };

    // 方塊標籤：
    // - prep/agent：標「形容詞片語 / 副詞片語 ↔ 被修飾詞」，讓讀者看出片語在做什麼。
    // - conj/appos：標出對等／同位的對象 —— 這兩種關係的 head 就是並列／同位的那個字。
    const blockLabel = (m: number): string => {
      const dep = tokens[m].dep;
      if (dep === "prep" || dep === "agent") {
        const head = tokens[tokens[m].head]?.text;
        const role = prepIsAdjectival(m) ? "形容詞片語" : "副詞片語";
        return head ? `${role} ↔ ${head}` : role;
      }
      if (dep === "conj" || dep === "appos") {
        const partner = tokens[tokens[m].head]?.text;
        if (partner) return `${depZh(dep)} ↔ ${partner}`;
      }
      // 子句作受詞時掛上 O 標記，呼應上方 SVO 句型徽章（只有 ccomp 方塊會拿到 O）。
      if (slots.get(m) === "O") return `${depZh(dep)}（O）`;
      return depZh(dep);
    };

    // 一個子句 = 主幹詞（skeletonSet）+ 掛在主幹上的非 CORE 子樹（各收成一個方塊）。
    const buildClause = (head: number, depth: number): SkeletonNode[] => {
      const skel = skeletonSet(head);
      const triggers = subtree(head).filter(
        (m) => m !== head && skel.has(tokens[m].head) && !CORE.has(tokens[m].dep)
      );

      const sortable: { sort: number; node: SkeletonNode }[] = [];
      skel.forEach((idx) => {
        const token = tokens[idx];
        sortable.push({
          sort: idx,
          node: {
            kind: "word",
            idx,
            token,
            category: cat(token.dep),
            isRoot: token.dep === "ROOT",
            slot: slots.get(idx),
          },
        });
      });
      triggers.forEach((m) => {
        const dep = tokens[m].dep;
        const node: BlockNode = {
          kind: "block",
          head: m,
          dep,
          label: blockLabel(m),
          category: cat(dep),
          preview: previewText(m),
          depth,
          children: buildClause(m, depth + 1),
        };
        blocks.push(node);
        sortable.push({ sort: subtree(m)[0], node }); // 方塊依其子樹起點排序
      });

      return sortable.sort((a, b) => a.sort - b.sort).map((u) => u.node);
    };

    const nodes = rootIdx < 0 ? [] : buildClause(rootIdx, 0);
    return { rootIdx, pattern, nodes, blocks, tree };
  }, [tokens, previewWords]);
}
