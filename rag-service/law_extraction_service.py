"""
law_extraction_service.py  (v2 — aligned with law_vector_db_v2.py)
===================================================================
Called by the FastAPI /extract-law endpoint.

Changes from v1
---------------
* _chunk_text() replaced with smart paragraph→sentence→word chunker
  (mirrors LocalLawVectorDB.chunk_text_smart).
* Section mapping uses char-position slicing (not char_ratio).
* Multi-vector per section:
      section_heading — heading only
      section         — heading + first 300 words of section body
      section_summary — heading + first sentence
  (mirrors LocalLawVectorDB.prepare_documents, layer 2).
* Long section bodies are chunked independently (chunk_type='section').
* Chapter headings indexed as chunk_type='chapter'.
* SHA-256 deduplication guards every chunk before it enters ChromaDB.
* Every chunk now carries section_num, section_head, term as empty-string
  defaults so metadata keys are consistent across all chunk_types.
* chunks_by_layer summary includes all new types.

Requirements:
    pip install pymongo pdfminer.six chromadb sentence-transformers
"""

from __future__ import annotations

import hashlib
import os
import re
import uuid
import time
from pathlib import Path
from datetime import datetime

from pymongo import MongoClient
from bson import ObjectId
import chromadb
from chromadb.utils import embedding_functions

from law_extractor import (
    extract_text_from_bytes,
    parse_filename,
    parse_law_document,
)
# ── Configuration ──────────────────────────────────────────────────────────────
MONGO_URI         = os.getenv("MONGO_URI",       "mongodb://localhost:27017/")
MONGO_DB          = os.getenv("MONGO_DB",         "LegisCounsel")
CHROMA_PATH       = os.getenv("LAW_CHROMA_PATH",  "./law_vector_db")
EMBED_MODEL       = os.getenv("EMBED_MODEL",      "BAAI/bge-base-en-v1.5")
CHROMA_COLLECTION = "laws_vector_db"

CHUNK_SIZE = 300
OVERLAP    = 50


# =============================================================================
#  1. Smart chunker  (mirrors LocalLawVectorDB.chunk_text_smart)
# =============================================================================

def _chunk_text_smart(
    text: str,
    chunk_size: int = CHUNK_SIZE,
    overlap: int = OVERLAP,
) -> list[str]:
    """
    Paragraph → sentence → word-level chunker.

    * Blank lines define paragraph boundaries (kept whole when ≤ chunk_size words).
    * Long paragraphs are split on sentence boundaries first.
    * Sentences that still exceed chunk_size fall back to a sliding word window.
    """
    text = re.sub(r"\r\n", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)

    paragraphs = re.split(r"\n\s*\n", text)
    chunks: list[str] = []
    step = max(1, chunk_size - overlap)

    for para in paragraphs:
        para = para.strip()
        if not para:
            continue

        words = para.split()
        if len(words) <= chunk_size:
            chunks.append(para)
            continue

        sentences = re.split(r"(?<=[.!?])\s+", para)
        buffer: list[str] = []
        buf_words = 0

        for sent in sentences:
            sent_words = sent.split()
            if not sent_words:
                continue

            if len(sent_words) > chunk_size:
                if buffer:
                    chunks.append(" ".join(buffer))
                    buffer, buf_words = [], 0
                for i in range(0, len(sent_words), step):
                    sub = " ".join(sent_words[i: i + chunk_size])
                    if sub:
                        chunks.append(sub)
                continue

            if buf_words + len(sent_words) > chunk_size:
                if buffer:
                    chunks.append(" ".join(buffer))
                buffer    = sent_words
                buf_words = len(sent_words)
            else:
                buffer.extend(sent_words)
                buf_words += len(sent_words)

        if buffer:
            chunks.append(" ".join(buffer))

    return [c for c in chunks if c.strip()]


# =============================================================================
#  2. Fixed section extraction by character position
#     (mirrors LocalLawVectorDB._extract_section_texts)
# =============================================================================

def _extract_section_texts(body_text: str, sections: list[dict]) -> list[dict]:
    """
    Extract each section's text by slicing body_text at its char position.

    Returns list of {number, heading, text, position}.
    """
    if not sections or not body_text:
        return []

    sorted_secs = sorted(sections, key=lambda s: int(s.get("position", 0)))
    body_len    = len(body_text)
    result: list[dict] = []

    for i, sec in enumerate(sorted_secs):
        start = int(sec.get("position", 0))
        end   = (
            int(sorted_secs[i + 1].get("position", body_len))
            if i + 1 < len(sorted_secs)
            else body_len
        )
        start = max(0, min(start, body_len))
        end   = max(start, min(end, body_len))
        text  = body_text[start:end].strip()

        result.append({
            "number":   str(sec.get("number", "")),
            "heading":  sec.get("heading", "").strip(),
            "text":     text,
            "position": start,
        })

    return result


# =============================================================================
#  3. SHA-256 deduplication helper
# =============================================================================

def _hash_doc(text: str) -> str:
    return hashlib.sha256(text.strip().lower().encode()).hexdigest()


# =============================================================================
#  Lazy singletons
# =============================================================================

_mongo_client:      MongoClient | None       = None
_chroma_collection: chromadb.Collection | None = None
_embed_fn = None


def _get_mongo():
    global _mongo_client
    if _mongo_client is None:
        _mongo_client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5_000)
        _mongo_client.admin.command("ping")
        print("[LawExtractionService] Connected to MongoDB.")
    return _mongo_client[MONGO_DB]


def _get_embed_fn():
    global _embed_fn
    if _embed_fn is None:
        print(f"[LawExtractionService] Loading embedding model '{EMBED_MODEL}' …")
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
        client = chromadb.PersistentClient(path=CHROMA_PATH)
        _chroma_collection = client.get_or_create_collection(
            name=CHROMA_COLLECTION,
            embedding_function=_get_embed_fn(),
            metadata={"hnsw:space": "cosine"},
        )
        print(
            f"[LawExtractionService] ChromaDB collection '{CHROMA_COLLECTION}' ready "
            f"({_chroma_collection.count()} existing chunks)."
        )
    return _chroma_collection


# =============================================================================
#  ID helper
# =============================================================================

def _make_id(prefix: str) -> str:
    safe = re.sub(r"[^A-Za-z0-9_-]", "_", prefix)[:50]
    return f"{safe}_{uuid.uuid4().hex[:8]}"


# =============================================================================
#  Core chunk builder  (mirrors prepare_documents in LocalLawVectorDB v2)
# =============================================================================

def _build_chunks(
    final_doc: dict,
    mongo_doc_id: str,
) -> tuple[list[str], list[dict], list[str]]:
    """
    Produce (texts, metadatas, ids) for every vectorisation layer.

    Layers  (matches law_vector_db_v2.py prepare_documents exactly):
        1. body_text chunks                      chunk_type = 'body'
        2a. section heading-only                 chunk_type = 'section_heading'
        2b. section heading + first 300 words    chunk_type = 'section'
        2c. section first-sentence summary       chunk_type = 'section_summary'
        2d. long section bodies (chunked)        chunk_type = 'section'
        3. defined terms                         chunk_type = 'definition'
        4. penalty clauses                       chunk_type = 'penalty'
        5. preamble                              chunk_type = 'preamble'
        6. chapter headings                      chunk_type = 'chapter'
    """
    law_title = (final_doc.get("file_stem") or final_doc.get("title") or mongo_doc_id)

    base_meta: dict = {
        "law_title":    law_title,
        "file_stem":    str(final_doc.get("file_stem",   "")),
        "doc_type":     str(final_doc.get("doc_type",    "")),
        "category":     str(final_doc.get("category",    "")),
        "jurisdiction": str(final_doc.get("jurisdiction", "")),
        "act_number":   str(final_doc.get("act_number",  "")),
        "year":         str(final_doc.get("year",        "")),
        "mongo_id":     mongo_doc_id,
        "source":       "LegisCounsel",
    }

    texts: list[str] = []
    metas: list[dict] = []
    ids:   list[str]  = []
    seen_hashes: set[str] = set()

    def add(text: str, meta: dict, id_prefix: str) -> None:
        """Dedup then append."""
        if not text or not text.strip():
            return
        h = _hash_doc(text)
        if h in seen_hashes:
            return
        seen_hashes.add(h)
        texts.append(text)
        metas.append(meta)
        ids.append(_make_id(id_prefix))

    body = (final_doc.get("body_text") or final_doc.get("full_text") or "").strip()

    # ── 1. Body chunks ────────────────────────────────────────────────────────
    if body:
        for idx, chunk in enumerate(_chunk_text_smart(body)):
            add(
                text=f"{law_title}: {chunk}",
                meta={
                    **base_meta,
                    "chunk_type":   "body",
                    "chunk_id":     idx,
                    "section_num":  "",
                    "section_head": "",
                    "term":         "",
                },
                id_prefix=f"body_{law_title}_{idx}",
            )

    # ── 2. Sections (fixed mapping + multi-vector) ────────────────────────────
    sections = final_doc.get("sections", [])
    if sections and body:
        section_data = _extract_section_texts(body, sections)

        for sec in section_data:
            sec_num  = sec["number"]
            heading  = sec["heading"]
            sec_text = sec["text"]

            if not heading:
                continue

            sec_meta_base = {
                **base_meta,
                "section_num":  sec_num,
                "section_head": heading,
                "term":         "",
                "chunk_id":     0,
            }

            # 2a. Heading only
            add(
                text=f"{law_title} — Section {sec_num}: {heading}",
                meta={**sec_meta_base, "chunk_type": "section_heading"},
                id_prefix=f"sec_heading_{law_title}_{sec_num}",
            )

            # 2b. Heading + first 300 words of section body
            body_snippet = " ".join(sec_text.split()[:300])
            if body_snippet:
                add(
                    text=(
                        f"{law_title} — Section {sec_num}: {heading}. "
                        f"{body_snippet}"
                    ),
                    meta={**sec_meta_base, "chunk_type": "section"},
                    id_prefix=f"sec_{law_title}_{sec_num}",
                )

            # 2c. First-sentence summary
            first_sent = re.split(r"(?<=[.!?])\s+", sec_text.strip())[0]
            if len(first_sent.split()) > 5:
                add(
                    text=(
                        f"{law_title} — Section {sec_num} summary: "
                        f"{heading}. {first_sent}"
                    ),
                    meta={**sec_meta_base, "chunk_type": "section_summary"},
                    id_prefix=f"sec_summ_{law_title}_{sec_num}",
                )

            # 2d. Chunk long section bodies independently
            if len(sec_text.split()) > 300:
                for c_idx, chunk in enumerate(
                    _chunk_text_smart(sec_text, chunk_size=300, overlap=50)
                ):
                    add(
                        text=(
                            f"{law_title} — Section {sec_num} "
                            f"({heading}): {chunk}"
                        ),
                        meta={
                            **sec_meta_base,
                            "chunk_type": "section",
                            "chunk_id":   c_idx + 1,
                        },
                        id_prefix=f"sec_chunk_{law_title}_{sec_num}_{c_idx}",
                    )

    # ── 3. Defined terms ──────────────────────────────────────────────────────
    for term_entry in final_doc.get("defined_terms", []):
        term_name  = str(term_entry.get("term",       "")).strip()
        definition = str(term_entry.get("definition", "")).strip()
        if not (term_name and definition):
            continue
        add(
            text=f"{law_title} — Definition of '{term_name}': {definition}",
            meta={
                **base_meta,
                "chunk_type":   "definition",
                "term":         term_name,
                "section_num":  "",
                "section_head": "",
                "chunk_id":     0,
            },
            id_prefix=f"def_{law_title}_{term_name}",
        )

    # ── 4. Penalty clauses ────────────────────────────────────────────────────
    for p_idx, clause in enumerate(final_doc.get("penalty_clauses", [])):
        clause = str(clause).strip()
        if len(clause) < 20:
            continue
        add(
            text=f"{law_title} — Penalty: {clause}",
            meta={
                **base_meta,
                "chunk_type":   "penalty",
                "term":         "",
                "section_num":  "",
                "section_head": "",
                "chunk_id":     p_idx,
            },
            id_prefix=f"penalty_{law_title}_{p_idx}",
        )

    # ── 5. Preamble ───────────────────────────────────────────────────────────
    preamble = str(final_doc.get("preamble") or "").strip()
    if len(preamble) > 30:
        add(
            text=f"{law_title} — Preamble: {preamble}",
            meta={
                **base_meta,
                "chunk_type":   "preamble",
                "term":         "",
                "section_num":  "",
                "section_head": "",
                "chunk_id":     0,
            },
            id_prefix=f"preamble_{law_title}",
        )

    # ── 6. Chapter headings ───────────────────────────────────────────────────
    for chap in final_doc.get("chapters", []):
        chap_num   = str(chap.get("number", "")).strip()
        chap_title = chap.get("title", "").strip()
        if not chap_title:
            continue
        add(
            text=f"{law_title} — Chapter {chap_num}: {chap_title}",
            meta={
                **base_meta,
                "chunk_type":   "chapter",
                "section_num":  f"Chapter {chap_num}",
                "section_head": chap_title,
                "term":         "",
                "chunk_id":     0,
            },
            id_prefix=f"chap_{law_title}_{chap_num}",
        )

    return texts, metas, ids


# =============================================================================
#  Core public function
# =============================================================================

def extract_and_index_law(
    file_path,
    mongo_doc_id: str,
    original_filename: str = None,
    pdf_path_prefix: str = "",
) -> dict:
    """
    Full pipeline for one law PDF.

    Steps
    -----
    1. Read bytes from file_path.
    2. Extract text + parse rich metadata via law_extractor.py.
    3. PATCH the MongoDB Law document (identified by mongo_doc_id)
       without overwriting fields the admin already filled in.
    4. Build 6-layer chunks (v2) and batch-add them to ChromaDB.

    Args:
        file_path:         Absolute path to the uploaded PDF on disk.
        mongo_doc_id:      MongoDB ObjectId string of the Law document.
        original_filename: Logical filename used for metadata inference.
        pdf_path_prefix:   Optional prefix for the pdf_path field.

    Returns:
        Summary dict with keys:
            mongo_doc_id, title, chunks_added, chunks_by_layer,
            section_count, definition_count, word_count.

    Raises:
        FileNotFoundError: PDF does not exist at file_path.
        ValueError:        No text could be extracted from the PDF.
    """
    path_obj = Path(file_path)
    if not path_obj.exists():
        raise FileNotFoundError(f"PDF not found at: {file_path}")

    pdf_bytes = path_obj.read_bytes()

    # ── 1. Extract text ────────────────────────────────────────────────────────
    text = extract_text_from_bytes(pdf_bytes)
    if not text.strip():
        raise ValueError(
            "No text could be extracted from the PDF "
            "(possibly a scanned / image-only document)."
        )

    # ── 2. Parse metadata ──────────────────────────────────────────────────────
    logical_name  = original_filename or path_obj.name
    filename_meta = parse_filename(logical_name)
    pdf_path      = f"{pdf_path_prefix}{logical_name}" if pdf_path_prefix else str(file_path)
    extracted     = parse_law_document(text, filename_meta, pdf_path=pdf_path)

    # ── 3. Patch MongoDB document ──────────────────────────────────────────────
    db = _get_mongo()

    KEEP_IF_SET = {
        "title", "category", "jurisdiction", "year",
        "doc_type", "act_number", "preamble", "enacting_authority",
    }

    existing = db["laws"].find_one({"_id": ObjectId(mongo_doc_id)}) or {}
    patch: dict = {}

    for key, value in extracted.items():
        if key == "created_at":
            continue
        if key in KEEP_IF_SET and existing.get(key):
            continue
        patch[key] = value

    patch["updated_at"] = datetime.utcnow()
    db["laws"].update_one(
        {"_id": ObjectId(mongo_doc_id)},
        {"$set": patch},
    )
    print(
        f"[LawExtractionService] Patched MongoDB doc {mongo_doc_id} "
        f"({len(patch)} fields updated)."
    )

    final_doc = db["laws"].find_one({"_id": ObjectId(mongo_doc_id)}) or {}

    # ── 4. Build chunks and add to ChromaDB ───────────────────────────────────
    collection        = _get_chroma_collection()
    texts, metas, ids = _build_chunks(final_doc, mongo_doc_id)

    if texts:
        batch_size = 100
        i=0
        for start in range(0, len(texts), batch_size):
            end = min(start + batch_size, len(texts))
            i=i+1
            print(f"[LawExtractionService] Added chunk {i}({end - start} items) out of {len(texts)} total")
            collection.add(
                documents=texts[start:end],
                metadatas=metas[start:end],
                ids=ids[start:end],
            )
        print(
            f"[LawExtractionService] Added {len(texts)} chunks to ChromaDB "
            f"(collection now has {collection.count()} total)."
        )

    # ── Summary ────────────────────────────────────────────────────────────────
    layer_counts: dict[str, int] = {}
    for m in metas:
        ct = m.get("chunk_type", "unknown")
        layer_counts[ct] = layer_counts.get(ct, 0) + 1

    law_title = final_doc.get("file_stem") or final_doc.get("title") or mongo_doc_id

    return {
        "mongo_doc_id":     mongo_doc_id,
        "title":            law_title,
        "chunks_added":     len(texts),
        "chunks_by_layer":  layer_counts,
        "section_count":    final_doc.get("section_count",  0),
        "definition_count": len(final_doc.get("defined_terms", [])),
        "word_count":       final_doc.get("word_count", 0),
    }