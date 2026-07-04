import type { SentencePattern, SentenceType, StructureRole } from "../../types";

// Single source of truth for the sentence-structure view's colors and labels.
// The tree itself now comes ready-made from the backend (POST /api/parse), so
// this file only maps a node's grammatical `role` to a color category + the
// Traditional-Chinese names used in tooltips and the pattern badge.

export type ColorCategory = "subj" | "pred" | "comp" | "pp" | "conj" | "mod" | "punct";

// role → color category. Objects share the object color (comp); complements
// (SC/OC) use the complement color (pp) so they read distinctly from objects.
const ROLE_CATEGORY: Record<StructureRole, ColorCategory> = {
  ROOT: "pred",
  S: "subj",
  V: "pred",
  O: "comp",
  DO: "comp",
  IO: "conj",
  SC: "pp",
  OC: "pp",
  HEAD: "mod",
  DET: "mod",
  MOD: "mod",
  PREP: "pp",
  ADV: "mod",
  ADJ: "mod",
  MARK: "mod",
  CONJ: "conj",
  PUNCT: "punct",
};

// Core clause constituents that earn an S/V/O/C underline (and a slot label).
// Other roles (modifiers, conjuncts, markers, punctuation) render plain.
const CORE_SLOTS = new Set<StructureRole>(["S", "V", "O", "IO", "DO", "SC", "OC"]);

// Traditional-Chinese name for each core slot, for the underline's tooltip.
export const SLOT_ZH: Partial<Record<StructureRole, string>> = {
  S: "主詞",
  V: "動詞",
  O: "受詞",
  IO: "間接受詞",
  DO: "直接受詞",
  SC: "主詞補語",
  OC: "受詞補語",
};

// Seven basic patterns, for the clause pattern badge's tooltip. SVA/SVOA
// carry an obligatory adverbial (必要狀語), e.g. "She is in the kitchen".
export const PATTERN_ZH: Record<SentencePattern, string> = {
  SV: "主詞＋動詞",
  SVC: "主詞＋動詞＋補語",
  SVO: "主詞＋動詞＋受詞",
  SVA: "主詞＋動詞＋必要狀語",
  SVOO: "主詞＋動詞＋間接受詞＋直接受詞",
  SVOC: "主詞＋動詞＋受詞＋受詞補語",
  SVOA: "主詞＋動詞＋受詞＋必要狀語",
};

// Badge text per pattern: SVOO is taught as SVIODO (S＋V＋間接受詞＋直接受詞).
export const PATTERN_DISPLAY: Record<SentencePattern, string> = {
  SV: "SV",
  SVC: "SVC",
  SVO: "SVO",
  SVA: "SVA",
  SVOO: "SVIODO",
  SVOC: "SVOC",
  SVOA: "SVOA",
};

// Whole-sentence structure type badge (單句/合句/複句/複合句).
export const SENTENCE_TYPE_ZH: Record<SentenceType, string> = {
  simple: "單句",
  compound: "合句",
  complex: "複句",
  "compound-complex": "複合句",
};

export const SENTENCE_TYPE_EN: Record<SentenceType, string> = {
  simple: "Simple",
  compound: "Compound",
  complex: "Complex",
  "compound-complex": "Compound-Complex",
};

// Whether the constituent sequence ("A+S+V+O") says more than the pattern
// badge already does — hide it when it is just the pattern spelled out.
export function sequenceAddsInfo(
  pattern: SentencePattern | undefined,
  displayPattern: string | undefined,
): boolean {
  if (!displayPattern) return false;
  if (!pattern) return true;
  return displayPattern.replace(/\+/g, "") !== PATTERN_DISPLAY[pattern];
}

export const roleCategory = (role: StructureRole): ColorCategory => ROLE_CATEGORY[role];

export const isCoreSlot = (role: StructureRole): boolean => CORE_SLOTS.has(role);
