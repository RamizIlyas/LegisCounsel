"""
law_extraction_service.py
=========================
Called by the FastAPI /extract-law endpoint.

Responsibilities
----------------
1. Read the uploaded PDF from disk.
2. Extract text + parse rich metadata (reuses law_extractor.py).
3. PATCH the existing MongoDB Law document (created by Node.js) with all
   the richly extracted fields — without overwriting what the admin typed.
4. Incrementally add new chunks to the existing law_vector_db ChromaDB
   collection (no full rebuild needed).

Chunk types (mirrors laws_vector_db_creater.py exactly):
  - Body text  : sliding-window chunks of body_text / full_text
  - Definitions: one chunk per formally defined term

NOTE: law_vector_db is the ChromaDB storage DIRECTORY, not a Python module.
      All helpers are inlined here to avoid any import conflict.

Requirements:
    pip install pymongo pdfminer.six chromadb sentence-transformers
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

# law_extractor.py must sit in the same directory as this file
from law_extractor import (
    extract_text_from_bytes,
    parse_filename,
    parse_law_document,
)

# ── Configuration ─────────────────────────────────────────────────────────────

MONGO_URI         = os.getenv("MONGO_URI",       "mongodb://localhost:27017/")
MONGO_DB          = os.getenv("MONGO_DB",         "LegisCounsel")
CHROMA_PATH       = os.getenv("LAW_CHROMA_PATH",  "./law_vector_db")   # the directory
EMBED_MODEL       = os.getenv("EMBED_MODEL",      "BAAI/bge-base-en-v1.5")
CHROMA_COLLECTION = "laws_vector_db"

CHUNK_SIZE = 300   # matches laws_vector_db_creater.py
OVERLAP    = 50


# =============================================================================
#  Chunking helper  (inlined from laws_vector_db_creater.py)
# =============================================================================

def _chunk_text(text: str, chunk_size: int = CHUNK_SIZE, overlap: int = OVERLAP) -> list:
    """Sliding-window word-level chunker — identical to LocalLawVectorDB.chunk_text."""
    words = text.split()
    chunks = []
    for i in range(0, len(words), chunk_size - overlap):
        chunk = " ".join(words[i : i + chunk_size])
        if chunk.strip():
            chunks.append(chunk)
    return chunks


# =============================================================================
#  Lazy singletons – loaded once per process, reused across requests
# =============================================================================

_mongo_client      = None
_chroma_collection = None
_embed_fn          = None


def _get_mongo():
    global _mongo_client
    if _mongo_client is None:
        _mongo_client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)
        _mongo_client.admin.command("ping")
        print("[LawExtractionService] Connected to MongoDB.")
    return _mongo_client[MONGO_DB]


def _get_embed_fn():
    global _embed_fn
    if _embed_fn is None:
        print(f"[LawExtractionService] Loading embedding model '{EMBED_MODEL}' ...")
        t0 = time.time()
        _embed_fn = embedding_functions.SentenceTransformerEmbeddingFunction(
            model_name=EMBED_MODEL,
            normalize_embeddings=True,
        )
        print(f"[LawExtractionService] Model loaded in {time.time() - t0:.1f}s")
    return _embed_fn


def _get_chroma_collection():
    global _chroma_collection
    if _chroma_collection is None:
        client = chromadb.PersistentClient(path=CHROMA_PATH)   # opens the directory
        _chroma_collection = client.get_or_create_collection(
            name=CHROMA_COLLECTION,
            embedding_function=_get_embed_fn(),
        )
        print(
            f"[LawExtractionService] ChromaDB collection '{CHROMA_COLLECTION}' ready "
            f"({_chroma_collection.count()} existing chunks)."
        )
    return _chroma_collection


# =============================================================================
#  Core function
# =============================================================================

def extract_and_index_law(
    file_path,
    mongo_doc_id,
    original_filename=None,
):
    """
    Full pipeline for one law PDF:

    1. Read bytes from disk.
    2. Extract text + parse rich metadata.
    3. Patch the MongoDB Law document (identified by mongo_doc_id).
    4. Add body-text chunks + definition chunks to ChromaDB.

    Returns a summary dict.
    """
    path_obj = Path(file_path)
    if not path_obj.exists():
        raise FileNotFoundError(f"PDF not found at: {file_path}")

    pdf_bytes = path_obj.read_bytes()

    # -- 1. Extract text
    text = extract_text_from_bytes(pdf_bytes)
    if not text.strip():
        raise ValueError(
            "No text could be extracted from the PDF "
            "(possibly a scanned / image-only document)."
        )

    # -- 2. Parse metadata
    logical_name  = original_filename or path_obj.name
    filename_meta = parse_filename(logical_name)
    extracted     = parse_law_document(text, filename_meta)

    # -- 3. Patch MongoDB document
    db = _get_mongo()

    # Fields the admin entered via the form – only overwrite if they were blank
    KEEP_IF_SET = {
        "title", "category", "jurisdiction", "year",
        "doc_type", "act_number", "preamble", "enacting_authority",
    }

    existing = db["laws"].find_one({"_id": ObjectId(mongo_doc_id)})
    patch = {}
    for key, value in extracted.items():
        if key == "created_at":
            continue                            # never touch created_at
        if key in KEEP_IF_SET and existing and existing.get(key):
            continue                            # keep what the admin typed
        patch[key] = value

    patch["updated_at"] = datetime.utcnow()
    db["laws"].update_one(
        {"_id": ObjectId(mongo_doc_id)},
        {"$set": patch},
    )
    print(f"[LawExtractionService] Patched MongoDB doc {mongo_doc_id}.")

    # Reload so ChromaDB metadata reflects the merged final state
    final_doc = db["laws"].find_one({"_id": ObjectId(mongo_doc_id)})

    # -- 4. Add chunks to ChromaDB
    collection = _get_chroma_collection()

    law_title  = final_doc.get("file_stem") or final_doc.get("title", mongo_doc_id)
    safe_title = law_title[:30].replace(" ", "_").replace("/", "-")

    # Shared metadata for every chunk (mirrors laws_vector_db_creater.py)
    base_meta = {
        "law_title":  law_title,
        "doc_type":   str(final_doc.get("doc_type",  "")),
        "category":   str(final_doc.get("document_category", "")),
        "act_number": str(final_doc.get("act_number", "")),
        "mongo_id":   mongo_doc_id,
        "source":     "LegisCounsel",
    }

    texts, metas, ids = [], [], []

    # Body-text chunks
    content = (final_doc.get("body_text") or final_doc.get("full_text", "")).strip()
    if content:
        for idx, chunk in enumerate(_chunk_text(content)):
            if not chunk.strip():
                continue
            texts.append(f"{law_title}: {chunk}")
            metas.append({**base_meta, "chunk_id": idx})
            ids.append(f"{safe_title}_{idx}_{uuid.uuid4().hex[:6]}")

    # Definition chunks (extra RAG signal, same as builder script)
    for term_entry in final_doc.get("defined_terms", []):
        term_name  = (term_entry.get("term")  or "").strip()
        definition = (term_entry.get("definition") or "").strip()
        if term_name and definition:
            texts.append(f"{law_title} - Definition of {term_name}: {definition}")
            metas.append({
                **base_meta,
                "type": "definition",
                "term": term_name,
            })
            ids.append(f"def_{term_name[:20]}_{uuid.uuid4().hex[:6]}")

    if texts:
        collection.add(documents=texts, metadatas=metas, ids=ids)
        print(f"[LawExtractionService] Added {len(texts)} chunks to ChromaDB.")

    return {
        "mongo_doc_id":  mongo_doc_id,
        "title":         law_title,
        "chunks_added":  len(texts),
        "section_count": final_doc.get("section_count", 0),
        "word_count":    final_doc.get("word_count", 0),
    }