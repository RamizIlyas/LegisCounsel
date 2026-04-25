# app.py
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import os

from rag_pipeline import LocalRAG
from case_extraction_service import extract_and_index
from law_extraction_service  import extract_and_index_law

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

rag = LocalRAG()


# =============================================================================
#  Shared request / response models
# =============================================================================

class ExtractRequest(BaseModel):
    file_path:         str           # absolute path on disk (set by Node.js)
    mongo_doc_id:      str           # _id of the document Node.js just created
    original_filename: Optional[str] = None


class ExtractResponse(BaseModel):
    status:       str                # "queued" | "done" | "error"
    mongo_doc_id: str
    detail:       Optional[str] = None


# =============================================================================
#  /ask  (existing RAG endpoint – unchanged)
# =============================================================================

class Query(BaseModel):
    question:        str
    conversation_id: Optional[str] = None
    history:         list          = []
    user_role:       Optional[str] = "client"
    case_section:    Optional[str] = None
    case_outcome:    Optional[str] = None


class LawSource(BaseModel):
    type:           str
    section_number: str
    section_title:  str
    chapter:        str


class CaseSource(BaseModel):
    type:     str
    citation: str
    court:    str
    outcome:  str
    sections: str


class AskResponse(BaseModel):
    answer:       str
    law_sources:  list[LawSource]
    case_sources: list[CaseSource]


@app.post("/ask", response_model=AskResponse)
def ask(query: Query):
    try:
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


# =============================================================================
#  /extract-case  (cases pipeline)
# =============================================================================

def _run_case_extraction(file_path, mongo_doc_id, original_filename):
    try:
        summary = extract_and_index(file_path, mongo_doc_id, original_filename)
        print(
            f"[extract-case] Done  "
            f"id={summary['mongo_doc_id']}  "
            f"citation={summary['citation']}  "
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
    return ExtractResponse(status="queued", mongo_doc_id=req.mongo_doc_id,
                           detail="Case extraction started in background")


@app.post("/extract-case/sync", response_model=ExtractResponse)
def extract_case_sync(req: ExtractRequest):
    """Synchronous version – useful for testing."""
    try:
        summary = extract_and_index(req.file_path, req.mongo_doc_id, req.original_filename)
        return ExtractResponse(
            status="done", mongo_doc_id=req.mongo_doc_id,
            detail=f"Extracted {summary['chunks_added']} chunks, outcome: {summary['outcome']}",
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


# =============================================================================
#  /extract-law  (laws pipeline)
# =============================================================================

def _run_law_extraction(file_path, mongo_doc_id, original_filename):
    try:
        summary = extract_and_index_law(file_path, mongo_doc_id, original_filename)
        print(
            f"[extract-law] Done  "
            f"id={summary['mongo_doc_id']}  "
            f"title={summary['title']}  "
            f"chunks={summary['chunks_added']}  "
            f"sections={summary['section_count']}"
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
    )
    return ExtractResponse(status="queued", mongo_doc_id=req.mongo_doc_id,
                           detail="Law extraction started in background")


@app.post("/extract-law/sync", response_model=ExtractResponse)
def extract_law_sync(req: ExtractRequest):
    """Synchronous version – useful for testing."""
    try:
        summary = extract_and_index_law(req.file_path, req.mongo_doc_id, req.original_filename)
        return ExtractResponse(
            status="done", mongo_doc_id=req.mongo_doc_id,
            detail=f"Extracted {summary['chunks_added']} chunks, "
                   f"sections: {summary['section_count']}",
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))