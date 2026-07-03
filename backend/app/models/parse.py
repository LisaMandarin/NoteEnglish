from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field

# Grammatical role of a node within its parent clause. Drives the S/V/O/C
# underline colors on the frontend. "ROOT" is the whole-sentence top node.
Role = Literal[
    "ROOT", "S", "V", "O", "IO", "DO", "SC", "OC", "HEAD", "DET", "MOD",
    "PREP", "ADV", "ADJ", "CONJ", "MARK", "PUNCT"
]

# Whether a node is a single word-run, an expandable phrase, or a nested clause.
NodeType = Literal["word", "phrase", "clause"]

# Five basic sentence patterns. Present on every clause node (main or embedded).
Pattern = Literal["SV", "SVC", "SVO", "SVOO", "SVOC"]

# Controlled Traditional-Chinese teaching label shown as a node's heading. Kept
# as an enum (not free text) so the AI can't drift and colors/labels stay stable.
Label = Literal[
    # word-level: grammatical function (core clause constituents)
    "主詞", "動詞", "受詞", "間接受詞", "直接受詞", "主詞補語", "受詞補語",
    "引導詞", "對等連接詞", "標點",
    # word-level: part of speech (for stray words inside an expanded phrase)
    "名詞", "代名詞", "限定詞", "形容詞", "副詞", "介系詞", "連接詞", "助動詞",
    # clause-level
    "主要子句", "受詞子句", "主詞子句", "補語子句", "副詞子句", "關係子句", "同位子句",
    # phrase-level
    "名詞片語", "動名詞片語", "不定詞片語", "原形動詞補語", "分詞片語",
    "介系詞片語", "形容詞片語", "副詞片語",
]


# One node of the pedagogical constituent tree. Concatenating every leaf node's
# leaf `text` values left-to-right reproduces the original sentence verbatim.
# Long phrase and clause nodes contain children; compact phrases may remain leaves.
# `pattern` is set only on clause nodes.
class StructureNode(BaseModel):
    text: str = Field(description="Verbatim surface text of this span")
    role: Role
    type: NodeType
    label: Label
    pattern: Optional[Pattern] = None
    children: Optional[list["StructureNode"]] = None


StructureNode.model_rebuild()


# Request body: a single sentence to analyze.
class ParseRequest(BaseModel):
    sentence: str = Field(description="The sentence to analyze")


# Response: the sentence's structure tree. The optional type remains for
# compatibility with parse results cached before request validation was added.
class ParseResponse(BaseModel):
    structure: Optional[StructureNode] = None
