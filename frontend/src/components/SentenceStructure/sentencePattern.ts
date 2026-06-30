import type { Token } from "./syntaxConfig";
import type { DepTree } from "./depTree";

// 五大句型的成分標記：主詞 S / 動詞 V / 受詞 O / 補語 C。
// 雙受詞句（SVOO）再細分為間接受詞 IO / 直接受詞 DO。
export type Slot = "S" | "V" | "O" | "IO" | "DO" | "C";

// 五大基本句型。
export type SentencePattern = "SV" | "SVC" | "SVO" | "SVOO" | "SVOC";

// dep → 成分槽。只涵蓋直接掛在主要子句 ROOT 動詞上的核心論元；
// 修飾語（det/amod/advmod…）與介系詞結構（prep/pobj）不屬於五大句型的成分，不標記。
const SLOT_BY_DEP: Record<string, Slot> = {
  // 主詞：含被動主詞、子句主詞、形式主詞 there
  nsubj: "S",
  nsubjpass: "S",
  csubj: "S",
  csubjpass: "S",
  expl: "S",
  // 動詞：助動詞 + 連繫動詞 + 片語動詞質詞（ROOT 主要動詞另外直接標 V；
  // spaCy 英文模型多把 be 當 ROOT）
  aux: "V",
  auxpass: "V",
  cop: "V",
  prt: "V",
  // 受詞 dobj / dative 視句型決定標籤（見下方），這裡不列。
  // 補語：主詞補語 attr/acomp + 受詞補語 oprd
  attr: "C",
  acomp: "C",
  oprd: "C",
};

export type PatternResult = {
  // 主要子句的五大句型；無 ROOT（解析失敗）時為 null。
  pattern: SentencePattern | null;
  // token index → 成分槽。主詞/受詞/補語涵蓋整個論元片語（子樹）的每個詞，
  // 動詞只含 ROOT + 助動詞 / 質詞，供底線標註成段使用。
  slots: Map<number, Slot>;
};

// 依 ROOT 動詞的直接子節點（核心論元）判定五大句型，並標出各 token 的成分。
// 只看主要子句，與後端 `_extract_stem`「只取主句」的策略一致；附屬子句不另標。
export function classifyPattern(tokens: Token[], tree: DepTree): PatternResult {
  const { rootIdx, childrenOf, subtree } = tree;
  const slots = new Map<number, Slot>();
  if (rootIdx < 0) return { pattern: null, slots };

  const children = childrenOf(rootIdx);
  const childDeps = children.map((c) => tokens[c].dep);
  const has = (dep: string): boolean => childDeps.includes(dep);
  const hasObj = has("dobj");
  const hasIobj = has("dative") || has("iobj");
  const hasOprd = has("oprd");
  const hasSubjComp = has("attr") || has("acomp");
  // that / wh 名詞子句作受詞（think *that…*、know *what…*）：UD 標 ccomp，
  // 但在五大句型裡就是 SVO 的受詞。只在沒有名詞受詞 dobj 時才認列，避免干擾 SVOO/SVOC。
  const hasClauseObj = !hasObj && has("ccomp");

  // 先判句型（成分最多往下退：SVOO / SVOC → SVO → SVC → SV），
  // 受詞標籤再依此決定：雙受詞句拆 IO/DO，單受詞句一律 O。
  let pattern: SentencePattern;
  if (hasObj && hasIobj) pattern = "SVOO";
  else if (hasObj && hasOprd) pattern = "SVOC";
  else if (hasObj) pattern = "SVO";
  else if (hasClauseObj) pattern = "SVO";
  else if (hasSubjComp) pattern = "SVC";
  else pattern = "SV";

  // 把一個論元片語（子樹）的每個詞都標同一成分，供底線涵蓋整段。
  // 每種論元成分（S/O/IO/DO/C）只認第一個構成元；後續同類（同位語、重複補語等，
  // 例如 "a process, the sum of …" 中第二個 attr）忽略，避免出現重複的 S/V/O/C。
  const claimed = new Set<Slot>();
  const tag = (head: number, slot: Slot): void => {
    if (claimed.has(slot)) return;
    claimed.add(slot);
    for (const i of subtree(head)) if (!slots.has(i)) slots.set(i, slot);
  };

  slots.set(rootIdx, "V"); // ROOT 即主要動詞
  for (const c of children) {
    const dep = tokens[c].dep;
    if (dep === "aux" || dep === "auxpass" || dep === "cop" || dep === "prt") {
      slots.set(c, "V"); // 動詞群可有多個（助動詞 / 質詞），不去重。
    } else if (dep === "dobj") {
      tag(c, pattern === "SVOO" ? "DO" : "O");
    } else if (dep === "ccomp" && hasClauseObj) {
      tag(c, "O"); // 子句作受詞：整個子句子樹標 O（內容仍由可摺疊方塊呈現）
    } else if (dep === "dative" || dep === "iobj") {
      tag(c, "IO");
    } else {
      const slot = SLOT_BY_DEP[dep];
      if (slot) tag(c, slot);
    }
  }

  return { pattern, slots };
}
