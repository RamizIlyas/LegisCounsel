"""
case_extraction_service.py
==========================
Called by the FastAPI /extract-case endpoint.

Responsibilities
----------------
1. Read the uploaded PDF from disk.
2. Run full text extraction + metadata parsing (reuses law_cases_extractor.py).
3. PATCH the existing MongoDB Judgement document (created by Node.js) with all
   the rich extracted fields.
4. Incrementally add the new document's chunks to the existing ChromaDB
   collection (no full rebuild needed).

Requirements:
    pip install pymongo pdfminer.six chromadb sentence-transformers

NOTE: cases_vector_db is the ChromaDB storage DIRECTORY, not a Python module.
      The helper functions from the vector-DB builder script are inlined here
      to avoid any import conflict with that directory name.
"""

import os
import uuid
import time
from pathlib import Path
from datetime import datetime

from pymongo import MongoClient
from bson import ObjectId
import chromadb
from chromadb.utils import embedding_functions

# law_cases_extractor.py must sit in the same directory as this file
from law_cases_extractor import (
    extract_text_from_bytes,
    parse_filename,
    parse_case_document,
)

# ── Configuration ─────────────────────────────────────────────────────────────

MONGO_URI         = os.getenv("MONGO_URI",   "mongodb://localhost:27017/")
MONGO_DB          = os.getenv("MONGO_DB",    "LegisCounsel")
CHROMA_PATH       = os.getenv("CHROMA_PATH", "./cases_vector_db")   # the directory
EMBED_MODEL       = os.getenv("EMBED_MODEL", "BAAI/bge-base-en-v1.5")
CHROMA_COLLECTION = "pakistan_law_cases"

CHUNK_SIZE = 350
OVERLAP    = 60


# ═══════════════════════════════════════════════════════════════════════════════
#  Chunking + metadata helpers  (inlined – not imported from the ChromaDB dir)
# ═══════════════════════════════════════════════════════════════════════════════

def _chunk_text(text: str, chunk_size: int = CHUNK_SIZE, overlap: int = OVERLAP) -> list[str]:
    """Sliding-window word-level chunker."""
    words = text.split()
    if not words:
        return []
    chunks = []
    step = chunk_size - overlap
    for i in range(0, len(words), step):
        chunk = " ".join(words[i : i + chunk_size])
        if chunk.strip():
            chunks.append(chunk.strip())
        if i + chunk_size >= len(words):
            break
    return chunks


def _build_summary_text(doc: dict) -> str:
    """Compact fact-dense summary for high-level retrieval."""
    parts = []
    if doc.get("citation"):
        parts.append(f"Citation: {doc['citation']}.")
    if doc.get("court"):
        parts.append(f"Court: {doc['court']}.")
    if doc.get("appellant") or doc.get("respondent"):
        parts.append(
            f"Parties: {doc.get('appellant', 'Unknown')} vs "
            f"{doc.get('respondent', 'Unknown')}."
        )
    if doc.get("decision_date"):
        parts.append(f"Decided: {doc['decision_date']}.")
    if doc.get("outcome"):
        parts.append(f"Outcome: {doc['outcome']}.")
    if doc.get("all_sections_cited"):
        parts.append(f"Sections: {', '.join(doc['all_sections_cited'])}.")
    if doc.get("judges"):
        judges = doc["judges"] if isinstance(doc["judges"], list) else [doc["judges"]]
        parts.append(f"Bench: {', '.join(judges)}.")
    if doc.get("headnotes"):
        hn = doc["headnotes"]
        summary_hn = hn[:3] if isinstance(hn, list) else [hn]
        parts.append("Key issues: " + " | ".join(summary_hn))
    return " ".join(parts)


def _build_base_metadata(doc: dict) -> dict:
    """Flat metadata dict for ChromaDB (values must be str/int/float/bool)."""
    def _str(v) -> str:
        if isinstance(v, list):
            return ", ".join(str(x) for x in v)
        return str(v) if v else ""

    return {
        "citation":         _str(doc.get("citation")),
        "case_name":        _str(doc.get("case_name")),
        "court":            _str(doc.get("court")),
        "appellant":        _str(doc.get("appellant")),
        "respondent":       _str(doc.get("respondent")),
        "law_code":         _str(doc.get("law_code")),
        "primary_sections": _str(doc.get("primary_sections")),
        "all_sections":     _str(doc.get("all_sections_cited")),
        "outcome":          _str(doc.get("outcome")),
        "decision_date":    _str(doc.get("decision_date")),
        "judges":           _str(doc.get("judges")),
        "source":           "Pakistan Court Judgements",
    }


# ═══════════════════════════════════════════════════════════════════════════════
#  Lazy singletons – loaded once per process, reused across requests
# ═══════════════════════════════════════════════════════════════════════════════

_mongo_client:      MongoClient | None = None
_chroma_collection: chromadb.Collection | None = None
_embed_fn = None


def _get_mongo():
    global _mongo_client
    if _mongo_client is None:
        _mongo_client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)
        _mongo_client.admin.command("ping")
        print("[ExtractionService] Connected to MongoDB.")
    return _mongo_client[MONGO_DB]


def _get_embed_fn():
    global _embed_fn
    if _embed_fn is None:
        print(f"[ExtractionService] Loading embedding model '{EMBED_MODEL}' …")
        t0 = time.time()
        _embed_fn = embedding_functions.SentenceTransformerEmbeddingFunction(
            model_name=EMBED_MODEL,
            normalize_embeddings=True,
        )
        print(f"[ExtractionService] Model loaded in {time.time() - t0:.1f}s")
    return _embed_fn


def _get_chroma_collection() -> chromadb.Collection:
    global _chroma_collection
    if _chroma_collection is None:
        client = chromadb.PersistentClient(path=CHROMA_PATH)   # opens the directory
        _chroma_collection = client.get_or_create_collection(
            name=CHROMA_COLLECTION,
            embedding_function=_get_embed_fn(),
            metadata={"hnsw:space": "cosine"},
        )
        print(
            f"[ExtractionService] ChromaDB collection '{CHROMA_COLLECTION}' ready "
            f"({_chroma_collection.count()} existing chunks)."
        )
    return _chroma_collection


# ═══════════════════════════════════════════════════════════════════════════════
#  Core function
# ═══════════════════════════════════════════════════════════════════════════════

def extract_and_index(
    file_path: str,
    mongo_doc_id: str,
    original_filename: str | None = None,
) -> dict:
    """
    Full pipeline for one PDF:

    1. Read bytes from disk.
    2. Extract text + parse rich metadata.
    3. Patch the MongoDB document (identified by mongo_doc_id).
    4. Add new chunks to the existing ChromaDB collection.

    Returns a summary dict: {mongo_doc_id, citation, chunks_added, word_count, outcome}
    """
    path_obj = Path(file_path)
    if not path_obj.exists():
        raise FileNotFoundError(f"PDF not found at: {file_path}")

    pdf_bytes = path_obj.read_bytes()

    # ── 1. Extract text ──────────────────────────────────────────────────────
    text = extract_text_from_bytes(pdf_bytes)
    if not text.strip():
        raise ValueError(
            "No text could be extracted from the PDF "
            "(possibly a scanned / image-only document)."
        )

    # ── 2. Parse metadata ────────────────────────────────────────────────────
    logical_name  = original_filename or path_obj.name
    filename_meta = parse_filename(logical_name)
    extracted     = parse_case_document(text, filename_meta)

    # ── 3. Patch MongoDB document ────────────────────────────────────────────
    db = _get_mongo()

    # Fields the admin entered via the form – only overwrite if they were blank
    KEEP_IF_SET = {
        "case_name", "court", "citation", "outcome",
        "law_code", "category", "decision_date",
        "appellant", "respondent",
    }

    existing = db["judgements"].find_one({"_id": ObjectId(mongo_doc_id)})
    patch = {}
    for key, value in extracted.items():
        if key == "created_at":
            continue                           # never touch created_at
        if key in KEEP_IF_SET and existing and existing.get(key):
            continue                           # keep what the admin typed
        patch[key] = value

    patch["updated_at"] = datetime.utcnow()
    db["judgements"].update_one(
        {"_id": ObjectId(mongo_doc_id)},
        {"$set": patch},
    )
    print(f"[ExtractionService] Patched MongoDB doc {mongo_doc_id}.")

    # Reload so ChromaDB metadata reflects the merged final state
    final_doc = db["judgements"].find_one({"_id": ObjectId(mongo_doc_id)})

    # ── 4. Add chunks to ChromaDB ────────────────────────────────────────────
    collection = _get_chroma_collection()
    citation   = final_doc.get("citation") or mongo_doc_id
    safe_id    = citation.replace(" ", "_").replace("/", "-")[:60]

    base_meta = {**_build_base_metadata(final_doc), "mongo_id": mongo_doc_id}
    texts, metas, ids = [], [], []

    # Summary chunk
    summary_text = _build_summary_text(final_doc)
    if summary_text.strip():
        texts.append(summary_text)
        metas.append({**base_meta, "chunk_type": "summary", "chunk_index": 0})
        ids.append(f"sum_{safe_id}_{uuid.uuid4().hex[:6]}")

    # Headnote chunks
    headnotes = final_doc.get("headnotes", [])
    if isinstance(headnotes, str):
        headnotes = [headnotes]
    for idx, hn in enumerate(headnotes):
        hn = hn.strip()
        if len(hn) < 20:
            continue
        texts.append(f"[{citation}] Legal issue: {hn}")
        metas.append({**base_meta, "chunk_type": "headnote", "chunk_index": idx})
        ids.append(f"hn_{safe_id}_{idx}_{uuid.uuid4().hex[:6]}")

    # Judgment body chunks
    judgment = final_doc.get("judgment_text", "") or final_doc.get("full_text", "")
    if judgment:
        for idx, chunk in enumerate(_chunk_text(judgment)):
            if len(chunk.split()) < 20:
                continue
            texts.append(f"[{citation}] {chunk}")
            metas.append({**base_meta, "chunk_type": "judgment", "chunk_index": idx})
            ids.append(f"jdg_{safe_id}_{idx}_{uuid.uuid4().hex[:6]}")

    if texts:
        collection.add(documents=texts, metadatas=metas, ids=ids)
        print(f"[ExtractionService] Added {len(texts)} chunks to ChromaDB.")

    return {
        "mongo_doc_id": mongo_doc_id,
        "citation":     citation,
        "chunks_added": len(texts),
        "word_count":   final_doc.get("word_count", 0),
        "outcome":      final_doc.get("outcome", ""),
    }