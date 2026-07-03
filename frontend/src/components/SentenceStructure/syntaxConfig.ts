import type { SentencePattern, StructureRole } from "../../types";

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

// Five basic patterns, for the clause pattern badge's tooltip.
export const PATTERN_ZH: Record<SentencePattern, string> = {
  SV: "主詞＋動詞",
  SVC: "主詞＋動詞＋補語",
  SVO: "主詞＋動詞＋受詞",
  SVOO: "主詞＋動詞＋間接受詞＋直接受詞",
  SVOC: "主詞＋動詞＋受詞＋受詞補語",
};

export const roleCategory = (role: StructureRole): ColorCategory => ROLE_CATEGORY[role];

export const isCoreSlot = (role: StructureRole): boolean => CORE_SLOTS.has(role);
