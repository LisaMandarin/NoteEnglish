# 句構分析改進計畫（接續用交接文件）

> 給新 session 的開場指令建議：「讀 `docs/sentence-structure-plan.md`，從『下一步』一節開始做。」
> 本文件是唯一權威來源；完成一項就更新本檔（勾掉、補記錄），讓下一個 session 不需要重讀歷史。

## 目前狀態（2026-07-04）

**Phase 1（可靠性修復）已完成並驗證**，等使用者實際使用確認。相關程式碼：

- `backend/app/services/gemini.py` — 分析主流程 `ai_analyze_structure`、prompt、驗證器、spaCy fallback
- `backend/app/services/structure.py` — 快取（記憶體 L1 + Supabase L2，key = sentence_hash + `PARSE_PROMPT_VERSION`，目前 **8**）
- `backend/app/services/nlp.py` — spaCy 工具（`strip_invisible`、`is_complete_sentence`、`analyze_tokens`）
- `backend/app/models/parse.py` — `StructureNode` schema（Role/NodeType/Pattern/Label 皆為 Literal enum）
- `frontend/src/components/SentenceStructure/`（`SentenceSkeleton.tsx`、`syntaxConfig.ts`）+ `frontend/src/types.ts`

Phase 1 做了什麼（都有單元測試，`backend/tests/test_structure.py`，67 tests）：

1. 驗證器與 prompt 規則 4 對齊：`_is_finite_embedded_clause` 只把「限定＋有主詞或引導詞」的子句算成必要子句節點（causative 的 O+OC 不再被打槍）。
2. 驗證分兩級：`_malformed_issue`（損壞，永遠擋）／`_nesting_issue`（巢狀不足，只觸發重試）；重試耗盡改回傳最後一版合格樹（degraded serve + logger warning），不再 502。
3. spaCy 降權：`_expand_missing_details` 只補 Gemini 留空的節點，絕不重組/改寫模型給的 children；`_clause_word_nodes` 只把動詞性 root 的動詞組標 V。
4. Gemini 留空子句 → `_unfilled_clause_issue` 先觸發重試（重試 prompt 會附上上次的具體缺陷 `previous_feedback`，含漏字 leaf 清單或未展開子句原文），最後一次才用 spaCy 填。
5. `strip_invisible`：清除 U+FEFF 等零寬字元（PDF 複製夾帶），用於 `split_sentences`、`structure._normalize`、`_normalize_for_compare`。
6. `_repair_missing_trailing_punct`：長句模型常漏句尾句號，直接補回而不是報錯。
7. `is_complete_sentence` 接受倒裝句（AUX root + acomp/attr + 帶主詞的 ccomp，例 "Most inspiring is that ..."）。
8. thinking budget 1024→4096（實測 2048 會讓引號句重建失敗）；`PARSE_PROMPT_VERSION` 5→8。

**⚠️ Git 狀態**：working tree 未 commit，且包含「更早之前 Codex 未提交的一層」（`nlp.py` 的 token 欄位 + `gemini.py` 的依存分組機制，HEAD 還停在 prompt v5）。Phase 1 疊在其上且依賴它——**不可單獨 revert `nlp.py`**。第一件事建議把現狀 commit（一個 commit 即可）。

已知殘留（屬 Phase 2 範圍，使用者已回報過）：

- 受格 gap 的關係子句 badge 顯示 SV 而非 SVO（"the perspective **that time gives**"）。
- 併合句頂層 badge 沿用第一個子句的句型（或缺 badge），無「合句」概念。
- 短的非限定關係子句（"In 2017, ... The Brothers Trust, which supports ..."）Gemini 常固執不給 children → 跑滿 3 次（首次約 45 秒）後以 fallback 出圖（品質可接受）。
- 動名詞（reading/grounded）詞性標籤偶標「動詞」；phrase 節點偶爾掛「主詞／受詞」這類 word-level label。

## 下一步（建議順序）

### ✅ 步驟 0：commit 現有變更（2026-07-04 完成）

Phase 1 程式碼其實已在 HEAD（9defeb5）；本 plan 文件以 7a0b21e commit。

### ✅ 步驟 1：Phase 3 — golden 迴歸測試（2026-07-04 完成）

已建 `backend/tests/test_parse_golden.py`（15 句、性質檢查如下述規格）；`pyproject.toml` 註冊 `gemini` marker 並以 `addopts = "-m 'not gemini'"` 讓預設與 CI 不跑。手動執行：`cd backend && poetry run python -m pytest -m gemini -q`。

**基準（2026-07-04，prompt v8）：15/15 通過，7 分 58 秒。** 其中 4 句以 degraded serve 出圖（性質檢查仍全過，僅巢狀不足）：

- 句 3（非限定關係子句）：`which supports...` 子句 Gemini 不給 children（符合已知殘留）
- 句 11（古典引文）：引文子句未展開
- 句 14（since/after）：頂層只找到 1 個必要子句節點（預期 2）
- 句 15（重後位修飾）：複雜片語被壓平成 word 節點

Phase 2 改動後全跑一次，對照此基準（degraded 數量不應增加）。

### 原步驟 1 規格（留供參考）

新檔 `backend/tests/test_parse_golden.py`，pytest marker `gemini`（CI 與預設不跑；手動 `cd backend && poetry run python -m pytest -m gemini -q`，需 `backend/.env` 的 `GEMINI_API_KEY`）。直接呼叫 `ai_analyze_structure(structure._normalize(s))` **繞過快取、不寫 Supabase**（注意：dev 與 prod 是同一個 Supabase 專案，勿透過 `get_structure` 測試）。

每句的性質檢查（不比對固定 golden tree，比對「性質」）：

- 不拋例外；`_malformed_issue` 為 None；leaf 逐字重建原句
- 無 word 節點掛片語/子句 label；無名詞被標 V；clause 節點都有 children
- 併合句頂層有 ≥2 個 主要子句 節點
- （Phase 2 後追加）badge 與子句成分一致

句庫（取自使用者的 example.pdf，已含全部踩過雷的 hard case；U+FEFF 用 `"﻿"` 寫進測試）：

1. `He is often described as relatable and grounded.`（被動+SVC）
2. `As a child, he found spelling and reading difficult and sometimes frustrating, but he never allowed those challenges to define him.`（併合句、SVOC×2 ← 曾必定 502）
3. `In 2017, the Holland family founded The Brothers Trust, which supports health and social programs.`（非限定關係子句 ← 常降級）
4. `The ocean covers more than 70 percent of Earth's surface, yet more than 80 percent of it remains unexplored.`（yet 併合句）
5. `During the Cold War, the U.S. had a tracking station in Seychelles to monitor Russian satellites.`（狀語前置+目的不定詞）
6. `He has explained that embracing his "inner child" helps him prepare for complex roles.`（that 子句+help O OC ← 曾必定 502）
7. `When I arrived in the United States last year, one of the things that had the biggest impact on me was seeing the spiritual strength of many faithful Saints—multigenerational gospel families of pioneer descendants who continue to walk the covenant path.`（44 字長句 ← 句尾句號 repair case；原文 em-dash 前有 U+FEFF）
8. `But that was not enough—I needed to know for myself.`（em-dash 併合句；原文有 U+FEFF ← 曾 502）
9. `In doing so, perhaps you will experience the same as I have; sometimes I need the perspective that time gives to see the refining and perfecting hand of our Savior, Jesus Christ, in my life and in my family's life.`（分號併合句+受格 gap 關係子句 ← 截圖回報案例）
10. `Most inspiring is that their faithfulness depends not only on their spiritual heritage but on their personal decision to follow the Savior.`（倒裝 ← 曾被 422 拒絕）
11. `The Lord taught this principle when He said to Peter, "Blessed art thou, Simon Bar-jona: for flesh and blood hath not revealed it unto thee, but my Father which is in heaven."`（古典英語+整句引文）
12. `Rather than seeing ADHD as a weakness, Holland views it as a source of creativity and imagination.`（分詞前置）
13. `Some creatures produce their own light through a process called bioluminescence, while others survive on the chemicals released from hydrothermal vents on the ocean floor.`（while+縮減關係子句×2）
14. `It has been 18 months since the United States reopened its embassy in Victoria, Seychelles, 27 years after Washington left the island nation.`（虛主詞+since/after 子句）
15. `Seychelles is an archipelago of 115 islands strategically located in the Indian Ocean at the confluence of Africa, South Asia and the Gulf states.`（重後位修飾）

成本：全跑一次約 15–40 次 Gemini 呼叫（flash）。跑完記錄通過率到本檔。

### 步驟 2（目前進行點）：Phase 2 — 心智圖對齊（動 schema + prompt + 前端）

教學框架 = 使用者提供的心智圖：七元素句型（含 **A＝狀語**）、SVOO 顯示為 **SVIODO**、結構類型（單句 Simple／合句 Compound／複句 Complex／複合句 Compound-Complex）、句子功能（直述/疑問/祈使/感嘆）。

**⚠️ 先問使用者再動工**（CLAUDE.md：UX 變更先提案）：

- badge 呈現：整句「結構類型」badge + 每個子句各自 pattern badge？合句頂層是否完全不顯示 pattern？
- 是否要顯示成分序列（如 `A+S+V+O`，狀語前置顯示 ASVO/SVAA）？
- SVOO 改顯示 SVIODO 確認？功能（直述句等）要不要做？

實作要點：

1. `Pattern` enum 擴為 `SV/SVO/SVC/SVA/SVOO/SVOC/SVOA`（`parse.py` + `types.ts` + prompt 的 pattern 說明；SVA=必要狀語如 be+地點、SVOA=put+O+地點）。
2. **badge 由後端從子句 children 的角色順序推導**（clause-level ADV → A），保證 badge 永遠與樹一致；SVOO 顯示字串 SVIODO。放新欄位（如 `display_pattern`），`pattern` 保持基本型以相容。
3. `sentence_type` 新欄位：從樹推導（頂層 ≥2 個對等主要子句→合句；含從屬子句→複句；皆有→複合句），加進 `ParseResponse` 與前端 badge；併合句頂層不掛單一 pattern。
4. Schema/驗證收緊：word 不得掛片語/子句 label、phrase 不掛 word-level 功能 label（進 `_malformed_issue` 或 Pydantic validator）；`role=ROOT` 僅限頂層；句尾標點自動移回頂層（deterministic）。
5. 殘留修正：受格 gap 關係子句 pattern 推導為 SVO；動名詞詞性標籤。
6. `PARSE_PROMPT_VERSION` → 9；前端 `PATTERN_ZH` 補新句型的中文（SVA 主詞＋動詞＋必要狀語…）；遵守 `frontend/CLAUDE.md`（AntD 優先、CSS 變數、mobile 驗證）。
7. 改完全跑 golden suite 對照步驟 1 的基準，並實際截圖驗證 UI（CLAUDE.md 規定）。

## 驗證守則（每次改動都適用）

- 改 prompt／schema／後處理 ⇒ **必 bump `PARSE_PROMPT_VERSION`**（否則舊快取吐舊樹）。
- 單元測試：`cd backend && poetry run python -m pytest tests/ -q`（不需 API key，2 秒）。
- 真實驗證：寫 scratchpad 腳本直接呼叫 `ai_analyze_structure`（繞過快取）跑 golden 句庫；UI 改動要實際開 app 或截圖確認。
- 失敗不進快取；成功才會（永久）。degraded serve 會留 `Serving under-nested structure analysis` warning log。
