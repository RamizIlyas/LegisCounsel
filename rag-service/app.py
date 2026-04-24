# app.py
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
from rag_pipeline import LocalRAG

# ── NEW: extraction service ───────────────────────────────────────────────────
from case_extraction_service import extract_and_index

app = FastAPI()

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


# ── NEW: extraction models ────────────────────────────────────────────────────

class ExtractRequest(BaseModel):
    file_path:         str            # absolute path on disk (set by Node.js)
    mongo_doc_id:      str            # _id of the Judgement doc Node.js created
    original_filename: Optional[str] = None


class ExtractResponse(BaseModel):
    status:       str          # "queued" | "done" | "error"
    mongo_doc_id: str
    detail:       Optional[str] = None


# ── Existing /ask endpoint ────────────────────────────────────────────────────

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


# ── NEW: /extract-case endpoint ───────────────────────────────────────────────

def _run_extraction(file_path: str, mongo_doc_id: str, original_filename: str | None):
    """Background task – runs after HTTP response is already sent."""
    try:
        summary = extract_and_index(file_path, mongo_doc_id, original_filename)
        print(
            f"[extract-case] ✅ Done  "
            f"id={summary['mongo_doc_id']}  "
            f"citation={summary['citation']}  "
            f"chunks={summary['chunks_added']}"
        )
    except Exception as exc:
        # Log but don't crash the process – the admin panel already saved the
        # basic record; the enriched fields just won't be there yet.
        print(f"[extract-case] ❌ Error for {mongo_doc_id}: {exc}")


@app.post("/extract-case", response_model=ExtractResponse)
def extract_case(req: ExtractRequest, background_tasks: BackgroundTasks):
    """
    Called by adminCaseController.js immediately after multer saves the PDF.

    Returns immediately with status="queued" while extraction runs in the
    background so the admin HTTP response is not blocked.
    """
    import os
    if not os.path.exists(req.file_path):
        raise HTTPException(
            status_code=400,
            detail=f"File not found at path: {req.file_path}"
        )

    background_tasks.add_task(
        _run_extraction,
        req.file_path,
        req.mongo_doc_id,
        req.original_filename,
    )

    return ExtractResponse(
        status       = "queued",
        mongo_doc_id = req.mongo_doc_id,
        detail       = "Extraction started in background",
    )


# ── Optional: sync endpoint for testing / debugging ──────────────────────────

@app.post("/extract-case/sync", response_model=ExtractResponse)
def extract_case_sync(req: ExtractRequest):
    """
    Same as /extract-case but waits for extraction to finish before returning.
    Useful for scripts / testing; not recommended for production uploads.
    """
    try:
        summary = extract_and_index(
            req.file_path, req.mongo_doc_id, req.original_filename
        )
        return ExtractResponse(
            status       = "done",
            mongo_doc_id = req.mongo_doc_id,
            detail       = f"Extracted {summary['chunks_added']} chunks, "
                           f"outcome: {summary['outcome']}",
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))