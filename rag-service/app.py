"""
app.py  (v2 — aligned with law_vector_db_v2.py / rag_pipeline v2)
==================================================================
FastAPI application for the LegisCounsel backend.

Endpoints
---------
POST /ask                — RAG query (laws + cases)
POST /extract-case       — async case PDF extraction
POST /extract-case/sync  — sync  case PDF extraction (testing)
POST /extract-law        — async law  PDF extraction
POST /extract-law/sync   — sync  law  PDF extraction (testing)

Changes from v1
---------------
* LawSource:
    - chunk_type now documents all v2 types:
          body | section | section_heading | section_summary |
          chapter | definition | penalty | preamble
    - Added `citation` field (formatted string from format_citation()).
    - section_num / section_head populated for: section, section_heading,
      section_summary, chapter.
    - term populated for: definition.
* Query.law_chunk_type comment updated to list all v2 chunk types.
* FIX #6: CaseSource.sections changed from bare `str` to `Optional[str]`
  with a field_validator that coerces a MongoDB list to a comma-joined string,
  preventing Pydantic ValidationError when primary_sections is stored as a list.
* FIX #7: background-task helper type hints changed from `str | None`
  (Python 3.10+ only) to `Optional[str]` for consistency with the rest of
  the codebase.
"""

import os
from typing import Literal, Optional

from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, field_validator

from rag_pipeline            import LocalRAG
from case_extraction_service import extract_and_index
from law_extraction_service  import extract_and_index_law

app = FastAPI(title="LegisCounsel API", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

rag = LocalRAG()


# =============================================================================
#  Valid chunk_type values (v2)
# =============================================================================

LawChunkType = Literal[
    "body",
    "section",
    "section_heading",
    "section_summary",
    "chapter",
    "definition",
    "penalty",
    "preamble",
]


# =============================================================================
#  Shared request / response models
# =============================================================================

class ExtractRequest(BaseModel):
    file_path:         str            # absolute path on disk (set by Node.js)
    mongo_doc_id:      str            # _id of the document Node.js just created
    original_filename: Optional[str] = None
    pdf_path_prefix:   Optional[str] = ""   # e.g. "/uploads/laws/" — stored as pdf_path


class ExtractResponse(BaseModel):
    status:       str                 # "queued" | "done" | "error"
    mongo_doc_id: str
    detail:       Optional[str] = None


# =============================================================================
#  /ask  — RAG query endpoint
# =============================================================================

class Query(BaseModel):
    question:        str
    conversation_id: Optional[str] = None
    history:         list          = Field(default_factory=list)
    user_role:       Optional[str] = "client"   # "client" | "lawyer"

    # ── Law retrieval filters (all optional) ──────────────────────────────────
    # v2 chunk types:
    #   body | section | section_heading | section_summary |
    #   chapter | definition | penalty | preamble
    # Leave None to let intent classification choose automatically.
    law_chunk_type:   Optional[LawChunkType] = None
    law_category:     Optional[str] = None   # e.g. 'PPC', 'CrPC'
    law_jurisdiction: Optional[str] = None   # e.g. 'Pakistan (Federal)', 'Punjab'
    law_year:         Optional[str] = None

    # ── Case retrieval filters (all optional) ─────────────────────────────────
    case_section:    Optional[str] = None
    case_outcome:    Optional[str] = None
    case_chunk_type: Optional[str] = None


class LawSource(BaseModel):
    """
    Structured law source returned by rag_pipeline.LocalRAG.ask().

    chunk_type determines which sub-fields are populated:

        body                → no sub-fields
        section             → section_num, section_head
        section_heading     → section_num, section_head
        section_summary     → section_num, section_head
        chapter             → section_num (e.g. "Chapter I"), section_head
        definition          → term
        penalty             → no sub-fields
        preamble            → no sub-fields

    citation is always populated — a formatted string such as:
        "Pakistan Penal Code (Act XLV of 1860) — Section 302 (Punishment of murder)"
    """
    type:         str
    chunk_type:   LawChunkType
    law_title:    str
    act_number:   Optional[str] = ""
    year:         Optional[str] = ""
    category:     Optional[str] = ""
    jurisdiction: Optional[str] = ""
    # Populated for section / section_heading / section_summary / chapter
    section_num:  Optional[str] = ""
    section_head: Optional[str] = ""
    # Populated for definition
    term:         Optional[str] = ""
    # Always present — human-readable citation string
    citation:     Optional[str] = ""


class CaseSource(BaseModel):
    type:     str
    citation: str
    court:    str
    outcome:  str
    # FIX #6: MongoDB stores primary_sections as either a str or a list[str].
    # The field is declared Optional[str] and the validator normalises both
    # shapes to a plain comma-joined string so Pydantic never raises a
    # ValidationError regardless of what is stored in MongoDB.
    sections: Optional[str] = ""

    @field_validator("sections", mode="before")
    @classmethod
    def coerce_sections_to_str(cls, v: object) -> str:
        if v is None:
            return ""
        if isinstance(v, list):
            return ", ".join(str(item) for item in v)
        return str(v)


class AskResponse(BaseModel):
    answer:       str
    law_sources:  list[LawSource]
    case_sources: list[CaseSource]


@app.post("/ask", response_model=AskResponse)
def ask(query: Query):
    """
    Run the full RAG pipeline and return an answer plus structured sources.
    """
    try:
        result = rag.ask(
            query            = query.question,
            history          = query.history or None,
            user_role        = query.user_role or "client",
            # law filters
            law_chunk_type   = query.law_chunk_type,
            law_category     = query.law_category,
            law_jurisdiction = query.law_jurisdiction,
            law_year         = query.law_year,
            # case filters
            case_section     = query.case_section,
            case_outcome     = query.case_outcome,
            case_chunk_type  = query.case_chunk_type,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))

    return AskResponse(
        answer       = result["answer"],
        law_sources  = [LawSource(**s) for s in result["law_sources"]],
        case_sources = [CaseSource(**s) for s in result["case_sources"]],
    )


# =============================================================================
#  /extract-case  — case PDF pipeline
# =============================================================================

# FIX #7: replaced `str | None` (Python 3.10+ only) with `Optional[str]`
# to match the Optional style used throughout the rest of the codebase.
def _run_case_extraction(
    file_path: str,
    mongo_doc_id: str,
    original_filename: Optional[str],
) -> None:
    try:
        summary = extract_and_index(file_path, mongo_doc_id, original_filename)
        print(
            f"[extract-case] Done  "
            f"id={summary['mongo_doc_id']}  "
            f"citation={summary.get('citation', '?')}  "
            f"chunks={summary['chunks_added']}"
        )
    except Exception as exc:
        print(f"[extract-case] Error for {mongo_doc_id}: {exc}")


@app.post("/extract-case", response_model=ExtractResponse)
def extract_case(req: ExtractRequest, background_tasks: BackgroundTasks):
    """
    Called by adminCaseController.js after multer saves the PDF.
    Returns immediately; extraction runs in the background.
    """
    if not os.path.exists(req.file_path):
        raise HTTPException(status_code=400, detail=f"File not found: {req.file_path}")

    background_tasks.add_task(
        _run_case_extraction,
        req.file_path,
        req.mongo_doc_id,
        req.original_filename,
    )
    return ExtractResponse(
        status="queued",
        mongo_doc_id=req.mongo_doc_id,
        detail="Case extraction started in background",
    )


@app.post("/extract-case/sync", response_model=ExtractResponse)
def extract_case_sync(req: ExtractRequest):
    """Synchronous version — useful for testing or admin tooling."""
    try:
        summary = extract_and_index(
            req.file_path,
            req.mongo_doc_id,
            req.original_filename,
        )
        return ExtractResponse(
            status="done",
            mongo_doc_id=req.mongo_doc_id,
            detail=(
                f"Extracted {summary['chunks_added']} chunks  |  "
                f"outcome: {summary.get('outcome', '?')}"
            ),
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


# =============================================================================
#  /extract-law  — law PDF pipeline
# =============================================================================

# FIX #7: replaced `str | None` with `Optional[str]`
def _run_law_extraction(
    file_path: str,
    mongo_doc_id: str,
    original_filename: Optional[str],
    pdf_path_prefix: str,
) -> None:
    try:
        summary = extract_and_index_law(
            file_path,
            mongo_doc_id,
            original_filename=original_filename,
            pdf_path_prefix=pdf_path_prefix,
        )
        layers = "  ".join(
            f"{k}={v}" for k, v in summary.get("chunks_by_layer", {}).items()
        )
        print(
            f"[extract-law] Done  "
            f"id={summary['mongo_doc_id']}  "
            f"title={summary['title']}  "
            f"chunks={summary['chunks_added']}  "
            f"sections={summary['section_count']}  "
            f"definitions={summary['definition_count']}  "
            f"layers=[ {layers} ]"
        )
    except Exception as exc:
        print(f"[extract-law] Error for {mongo_doc_id}: {exc}")


@app.post("/extract-law", response_model=ExtractResponse)
def extract_law(req: ExtractRequest, background_tasks: BackgroundTasks):
    """
    Called by adminLawController.js after multer saves the PDF.
    Returns immediately; extraction runs in the background.
    """
    if not os.path.exists(req.file_path):
        raise HTTPException(status_code=400, detail=f"File not found: {req.file_path}")

    background_tasks.add_task(
        _run_law_extraction,
        req.file_path,
        req.mongo_doc_id,
        req.original_filename,
        req.pdf_path_prefix or "",
    )
    return ExtractResponse(
        status="queued",
        mongo_doc_id=req.mongo_doc_id,
        detail="Law extraction started in background",
    )


@app.post("/extract-law/sync", response_model=ExtractResponse)
def extract_law_sync(req: ExtractRequest):
    """Synchronous version — useful for testing or admin tooling."""
    try:
        summary = extract_and_index_law(
            req.file_path,
            req.mongo_doc_id,
            original_filename=req.original_filename,
            pdf_path_prefix=req.pdf_path_prefix or "",
        )
        layers = ", ".join(
            f"{k}: {v}" for k, v in summary.get("chunks_by_layer", {}).items()
        )
        return ExtractResponse(
            status="done",
            mongo_doc_id=req.mongo_doc_id,
            detail=(
                f"Extracted {summary['chunks_added']} chunks  |  "
                f"sections: {summary['section_count']}  |  "
                f"definitions: {summary['definition_count']}  |  "
                f"layers: [{layers}]"
            ),
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))