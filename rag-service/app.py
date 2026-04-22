# app.py
from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
from rag_pipeline import LocalRAG

app = FastAPI()

# Allow your React dev server to call this API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

rag = LocalRAG()


# ── Request / Response models ─────────────────────────────────────────────────

class Query(BaseModel):
    question:        str
    conversation_id: Optional[str] = None
    history:         list          = []   # list of {role, content} dicts
    user_role:       Optional[str] = "client"  # e.g. "client", "lawyer"
    # Optional RAG filters
    case_section:    Optional[str] = None  # e.g. "302"
    case_outcome:    Optional[str] = None  # e.g. "Acquitted"


class LawSource(BaseModel):
    type:           str   # always "law"
    section_number: str
    section_title:  str
    chapter:        str


class CaseSource(BaseModel):
    type:     str         # always "case"
    citation: str
    court:    str
    outcome:  str
    sections: str         # primary sections cited, e.g. "302"


class AskResponse(BaseModel):
    answer:       str
    law_sources:  list[LawSource]
    case_sources: list[CaseSource]


# ── Endpoint ──────────────────────────────────────────────────────────────────

@app.post("/ask", response_model=AskResponse)
def ask(query: Query):
    try:
        # print("Received query:", query)
        result = rag.ask(
            query        = query.question,
            history      = query.history or None,
            user_role    = query.user_role or "client",
            case_section = query.case_section,
            case_outcome = query.case_outcome,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    return AskResponse(
        answer       = result["answer"],
        law_sources  = result["law_sources"],
        case_sources = result["case_sources"],
    )