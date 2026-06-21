import type { SyntaxToken } from "../../types";

// Single source of truth for the sentence-structure (skeleton-fold) view:
// the dependency-label → 繁中/分類 table, the CORE skeleton set, and the
// category → color-token mapping. Adjust teaching depth here (e.g. a beginner
// build can move pobj / mark out of CORE) without touching the component.

export type DepCategory = "subj" | "pred" | "comp" | "pp" | "conj" | "mod" | "punct";

// Data contract from POST /api/parse (spaCy). Aliased as Token for this feature's internal naming.
export type Token = SyntaxToken;

// dep → { 繁中名稱, 語法功能分類 }（完整移植參考檔 DEP）
export const DEP: Record<string, { zh: string; cat: DepCategory }> = {
  ROOT: { zh: "主要動詞", cat: "pred" },
  nsubj: { zh: "主詞", cat: "subj" },
  nsubjpass: { zh: "被動主詞", cat: "subj" },
  csubj: { zh: "子句主詞", cat: "subj" },
  expl: { zh: "形式主詞", cat: "subj" },
  aux: { zh: "助動詞", cat: "pred" },
  auxpass: { zh: "被動助動詞", cat: "pred" },
  cop: { zh: "連繫動詞", cat: "pred" },
  attr: { zh: "主詞補語(名詞)", cat: "comp" },
  acomp: { zh: "主詞補語(形容詞)", cat: "comp" },
  dobj: { zh: "受詞", cat: "comp" },
  dative: { zh: "間接受詞", cat: "comp" },
  oprd: { zh: "受詞補語", cat: "comp" },
  ccomp: { zh: "子句補語", cat: "comp" },
  xcomp: { zh: "開放補語", cat: "comp" },
  pcomp: { zh: "介詞補語(子句)", cat: "comp" },
  prep: { zh: "介系詞", cat: "pp" },
  pobj: { zh: "介系詞受詞", cat: "pp" },
  agent: { zh: "動作者 by", cat: "pp" },
  case: { zh: "所有格標記", cat: "pp" },
  det: { zh: "限定詞", cat: "mod" },
  amod: { zh: "形容詞修飾", cat: "mod" },
  advmod: { zh: "副詞修飾", cat: "mod" },
  nummod: { zh: "數量修飾", cat: "mod" },
  npadvmod: { zh: "名詞作副詞", cat: "mod" },
  poss: { zh: "所有格", cat: "mod" },
  compound: { zh: "複合名詞", cat: "mod" },
  neg: { zh: "否定詞", cat: "mod" },
  mark: { zh: "從屬連接詞", cat: "mod" },
  advcl: { zh: "副詞子句", cat: "mod" },
  acl: { zh: "名詞後位子句", cat: "mod" },
  relcl: { zh: "關係子句", cat: "mod" },
  appos: { zh: "同位語", cat: "mod" },
  prt: { zh: "動詞質詞", cat: "mod" },
  punct: { zh: "標點", cat: "punct" },
  cc: { zh: "對等連接詞", cat: "conj" },
  conj: { zh: "對等成分", cat: "conj" },
  preconj: { zh: "前置關聯詞", cat: "conj" },
};

// 圖例用的分類繁中名（不含 punct）
export const CAT_ZH: Record<Exclude<DepCategory, "punct">, string> = {
  subj: "主詞",
  pred: "述語/動詞",
  comp: "受詞/補語",
  pp: "介系詞結構",
  conj: "並列",
  mod: "修飾語",
};

// 分類 → index.css :root 的色彩 token 名（顏色的單一真實來源）
export const CAT_COLOR_VAR: Record<Exclude<DepCategory, "punct">, string> = {
  subj: "--c-subj",
  pred: "--c-pred",
  comp: "--c-comp",
  pp: "--c-pp",
  conj: "--c-conj",
  mod: "--c-mod",
};

// 骨架核心關係：直接以文字顯示；其餘關係收成可摺疊膠囊。
// 完整移植參考檔；日後初學版可把 pobj、mark 等移出此集合讓主幹更精簡。
export const CORE = new Set<string>([
  "ROOT", "nsubj", "nsubjpass", "csubj", "csubjpass", "expl", "aux", "auxpass", "cop",
  "dobj", "dative", "attr", "acomp", "oprd", "prt", "neg", "det", "poss", "amod", "nummod",
  "advmod", "compound", "case", "punct", "cc", "preconj", "pobj", "mark", "npadvmod",
]);

export const depZh = (dep: string): string => DEP[dep]?.zh ?? dep;

export const cat = (dep: string): DepCategory => DEP[dep]?.cat ?? "mod";

// 膠囊樣式只有三種：pp / conj / 其餘歸 mod（移植參考檔 makePill 的 pclass 邏輯）
export const pillCat = (dep: string): "pp" | "conj" | "mod" => {
  const c = cat(dep);
  return c === "pp" ? "pp" : c === "conj" ? "conj" : "mod";
};

// 連接 token 文字並修正標點 / 所有格前的空白（移植參考檔的 regex）
export const joinTokens = (texts: string[]): string =>
  texts.join(" ").replace(/ ([,.])/g, "$1").replace(/ 's/g, "'s");
