from pydantic import BaseModel, Field


# One token of a dependency parse (matches the frontend SyntaxToken shape).
class ParseToken(BaseModel):
    text: str = Field(description="Token surface text")
    dep: str = Field(description="Dependency relation (spaCy dep_); 'ROOT' for the root")
    head: int = Field(description="Index of the governing token; the ROOT token points to itself")


# Request body: a single sentence to dependency-parse.
class ParseRequest(BaseModel):
    sentence: str = Field(description="The sentence to dependency-parse")


# Response: the sentence's tokens in order.
class ParseResponse(BaseModel):
    tokens: list[ParseToken] = Field(description="Tokens in sentence order")
