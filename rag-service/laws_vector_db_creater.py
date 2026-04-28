"""
LegisCounsel — Enhanced Vector Database Builder  v2
====================================================
Improvements over v1
────────────────────
1.  Fix section mapping    — character-position slicing replaces char_ratio
2.  Deduplication          — SHA-256 hash guard before every add
3.  Reranking layer        — CrossEncoder reranks retrieved candidates
4.  Smart chunking         — paragraph → sentence → word hierarchy
5.  Hybrid search          — BM25 + vector with Reciprocal Rank Fusion (RRF)
6.  Multi-vector per doc   — heading-only / heading+body / first-sentence
7.  Query intent           — classify to boost the right chunk_type
8.  Citation-aware         — every result carries law_title, section_num, chunk_type

Requirements
────────────
    pip install chromadb pymongo sentence-transformers rank-bm25
"""

from __future__ import annotations

import hashlib
import pickle
import re
import time
import uuid
from collections import defaultdict
from pathlib import Path
from typing import Optional

import chromadb
from chromadb.utils import embedding_functions
from pymongo import MongoClient

# ── Optional heavy dependencies (graceful degradation) ────────────────────────
try:
    from rank_bm25 import BM25Okapi
    _BM25_OK = True
except ImportError:
    _BM25_OK = False
    print("⚠️  rank-bm25 not found — BM25 hybrid search disabled.  "
          "pip install rank-bm25")

try:
    from sentence_transformers import CrossEncoder
    _RERANK_OK = True
except ImportError:
    _RERANK_OK = False
    print("⚠️  CrossEncoder unavailable — reranking disabled.  "
          "pip install sentence-transformers")


# ─────────────────────────────────────────────────────────────────────────────
#  Load bi-encoder ONCE (shared across all instances)
# ─────────────────────────────────────────────────────────────────────────────
print("🔄 Loading bi-encoder embedding model …")
embedding_function_global = embedding_functions.SentenceTransformerEmbeddingFunction(
    model_name="BAAI/bge-base-en-v1.5",
    normalize_embeddings=True,
)
print("✅ Bi-encoder ready.")

# Cross-encoder for reranking (loaded lazily inside the class)
_CROSS_ENCODER_MODEL = "cross-encoder/ms-marco-MiniLM-L-6-v2"


# ══════════════════════════════════════════════════════════════════════════════
#  Query intent taxonomy
# ══════════════════════════════════════════════════════════════════════════════

# Maps an intent label → list of (regex, weight) patterns used for detection.
# Also maps intent → preferred chunk_types for ChromaDB where-filter boosting.
INTENT_PATTERNS: dict[str, list[str]] = {
    "definition": [
        r"\bdefin(?:e|ition|ed)\b",
        r"\bwhat (?:is|are|does)\b",
        r"\bmean(?:ing|s)?\b",
        r"\bterm\b",
    ],
    "penalty": [
        r"\bpenalt(?:y|ies)\b",
        r"\bpunish(?:ment|able|ed)?\b",
        r"\bsentenc(?:e|ing)\b",
        r"\bfine\b",
        r"\bimprison(?:ment|ed)?\b",
        r"\bliable\b",
    ],
    "procedural": [
        r"\bprocedure\b",
        r"\bprocess\b",
        r"\bsteps?\b",
        r"\bhow to\b",
        r"\bapplication\b",
        r"\bfiling\b",
        r"\btribunal\b",
        r"\bcourt\b",
        r"\bjurisdiction\b",
    ],
    "bail": [
        r"\bbail\b",
        r"\bsurety\b",
        r"\bdetention\b",
        r"\bcustody\b",
    ],
    "general": [],   # fallback
}

INTENT_CHUNK_BOOST: dict[str, list[str]] = {
    "definition": ["definition"],
    "penalty":    ["penalty", "body"],
    "procedural": ["section", "body"],
    "bail":       ["section", "body"],
    "general":    [],           # no filter — search all chunk types
}


# ══════════════════════════════════════════════════════════════════════════════
#  LocalLawVectorDB   (names kept for backwards compatibility)
# ══════════════════════════════════════════════════════════════════════════════

class LocalLawVectorDB:
    """
    Reads from MongoDB 'laws' collection and indexes every law into ChromaDB.

    Public API (backwards compatible with v1):
        prepare_documents()             → (documents, metadatas, ids)
        chunk_text(text, ...)           → list[str]          # kept for compat
        create_vector_database_fast()   → None

    New public API:
        chunk_text_smart(text, ...)     → list[str]
        search_hybrid(query, ...)       → list[dict]
        search_vector(query, ...)       → list[dict]
        search_bm25(query, ...)         → list[dict]
        classify_query_intent(query)    → str
        format_citation(result)         → str
    """

    # ── BM25 corpus file stored next to ChromaDB ──────────────────────────────
    _BM25_CORPUS_FILE = "bm25_corpus.pkl"

    # ── Construction ──────────────────────────────────────────────────────────

    def __init__(
        self,
        mongodb_uri: str = "mongodb://localhost:27017/",
        db_name: str = "LegisCounsel",
        chroma_path: str = "./law_vector_db",
        collection_name: str = "laws_vector_db",
        reset_collection: bool = True,
        reranker_model: str = _CROSS_ENCODER_MODEL,
    ):
        """
        Args:
            mongodb_uri:      MongoDB connection string.
            db_name:          MongoDB database name.
            chroma_path:      Filesystem path for ChromaDB persistence.
            collection_name:  ChromaDB collection name.
            reset_collection: Delete and recreate the collection on each run.
            reranker_model:   HuggingFace cross-encoder model name.
        """
        print("🚀 Initialising Enhanced Law Vector Database …")
        t0 = time.time()

        self.chroma_path = chroma_path
        Path(chroma_path).mkdir(parents=True, exist_ok=True)

        # ── MongoDB ───────────────────────────────────────────────
        self.mongo_client    = MongoClient(mongodb_uri)
        self.db              = self.mongo_client[db_name]
        self.laws_collection = self.db["laws"]

        # ── ChromaDB ──────────────────────────────────────────────
        self.chroma_client = chromadb.PersistentClient(path=chroma_path)

        if reset_collection:
            try:
                self.chroma_client.delete_collection(collection_name)
                print(f"  ✓ Cleared existing collection '{collection_name}'")
            except Exception:
                pass

        self.collection = self.chroma_client.get_or_create_collection(
            name=collection_name,
            embedding_function=embedding_function_global,
            metadata={"hnsw:space": "cosine"},
        )

        # ── Cross-encoder (lazy) ──────────────────────────────────
        self._reranker: Optional[CrossEncoder] = None
        self._reranker_model = reranker_model

        # ── BM25 state ────────────────────────────────────────────
        self._bm25: Optional["BM25Okapi"] = None     # type: ignore[name-defined]
        self._bm25_ids: list[str] = []
        self._bm25_docs: list[str] = []
        self._bm25_metas: list[dict] = []

        # ── Deduplication seen-set ────────────────────────────────
        self._seen_hashes: set[str] = set()

        print(f"✅ Initialisation done in {time.time() - t0:.2f}s")

    # ─────────────────────────────────────────────────────────────────────────
    #  INTERNAL HELPERS
    # ─────────────────────────────────────────────────────────────────────────

    @staticmethod
    def _make_id(prefix: str) -> str:
        """Collision-resistant ChromaDB document ID."""
        safe = re.sub(r"[^A-Za-z0-9_-]", "_", prefix)[:50]
        return f"{safe}_{uuid.uuid4().hex[:8]}"

    @staticmethod
    def _law_base_meta(law: dict) -> dict:
        """Metadata fields shared by every chunk of a given law."""
        return {
            "law_title":    law.get("title", law.get("file_stem", "")),
            "file_stem":    law.get("file_stem", ""),
            "doc_type":     law.get("doc_type", ""),
            "category":     law.get("category", ""),
            "jurisdiction": law.get("jurisdiction", ""),
            "act_number":   law.get("act_number", ""),
            "year":         str(law.get("year", "")),
            "source":       "LegisCounsel",
        }

    def _hash_doc(self, text: str) -> str:
        """SHA-256 hex digest of normalised text — used for deduplication."""
        return hashlib.sha256(text.strip().lower().encode()).hexdigest()

    def _is_duplicate(self, text: str) -> bool:
        """
        Return True if this exact text has already been queued.
        Registers the hash if it is new.
        """
        h = self._hash_doc(text)
        if h in self._seen_hashes:
            return True
        self._seen_hashes.add(h)
        return False

    # ── 1. FIXED: section text extraction by character position ───────────────

    def _extract_section_texts(
        self,
        body_text: str,
        sections: list[dict],
    ) -> list[dict]:
        """
        Extract each section's raw text using its character position in body_text.

        Replaces the old char_ratio approximation — this uses the actual
        ``position`` field stored by the extractor, which is a character offset
        into ``body_text``.

        Returns list of dicts:
            {number, heading, text, position}
        """
        if not sections or not body_text:
            return []

        # Sort by position so slicing [start:next_start] is correct.
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
            # Clamp and extract
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

    # ── 4. SMART CHUNKING: paragraph → sentence → word ────────────────────────

    def chunk_text_smart(
        self,
        text: str,
        chunk_size: int = 300,
        overlap: int = 50,
    ) -> list[str]:
        """
        Paragraph-and-sentence-aware chunking.

        Strategy:
          1. Split on blank lines (paragraph boundaries).
          2. If a paragraph is within chunk_size words → keep it whole.
          3. If too long → split on sentence boundaries (``'. '`` / ``'\\n'``).
          4. If a sentence is still too long → fall back to word-level sliding
             window (identical to the original chunk_text logic).

        Args:
            text:       Input text.
            chunk_size: Target chunk size in words.
            overlap:    Overlap in words between adjacent word-level sub-chunks.

        Returns:
            Non-empty string chunks.
        """
        # Normalise whitespace while preserving paragraph breaks
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
                # Paragraph fits → keep whole
                chunks.append(para)
                continue

            # Too long → try sentence boundaries first
            sentences = re.split(r"(?<=[.!?])\s+", para)
            buffer: list[str] = []
            buf_words = 0

            for sent in sentences:
                sent_words = sent.split()
                if not sent_words:
                    continue

                if len(sent_words) > chunk_size:
                    # Flush buffer first
                    if buffer:
                        chunks.append(" ".join(buffer))
                        buffer, buf_words = [], 0
                    # Long sentence → word-level sliding window
                    for i in range(0, len(sent_words), step):
                        sub = " ".join(sent_words[i: i + chunk_size])
                        if sub:
                            chunks.append(sub)
                    continue

                if buf_words + len(sent_words) > chunk_size:
                    if buffer:
                        chunks.append(" ".join(buffer))
                    # Start new buffer with overlap from previous sentence
                    buffer    = sent_words
                    buf_words = len(sent_words)
                else:
                    buffer.extend(sent_words)
                    buf_words += len(sent_words)

            if buffer:
                chunks.append(" ".join(buffer))

        return [c for c in chunks if c.strip()]

    # ── v1 compatibility wrapper ───────────────────────────────────────────────

    def chunk_text(
        self,
        text: str,
        chunk_size: int = 300,
        overlap: int = 50,
    ) -> list[str]:
        """Backwards-compatible name — delegates to chunk_text_smart."""
        return self.chunk_text_smart(text, chunk_size, overlap)

    # ─────────────────────────────────────────────────────────────────────────
    #  DOCUMENT PREPARATION  (all 8 improvements applied here)
    # ─────────────────────────────────────────────────────────────────────────

    def prepare_documents(self) -> tuple[list[str], list[dict], list[str]]:
        """
        Fetch every document from MongoDB and produce three parallel lists:
            documents  — text strings to embed
            metadatas  — dicts with full citation context
            ids        — unique ChromaDB IDs

        Vectorisation layers
        ────────────────────
        1.  body_text chunks       (chunk_type = 'body')
        2a. section heading-only   (chunk_type = 'section_heading')   ← multi-vector
        2b. section heading+body   (chunk_type = 'section')           ← multi-vector
        2c. section first-sentence (chunk_type = 'section_summary')   ← multi-vector
        3.  defined terms          (chunk_type = 'definition')
        4.  penalty clauses        (chunk_type = 'penalty')
        5.  preamble               (chunk_type = 'preamble')
        6.  chapter headings       (chunk_type = 'chapter')

        All chunks pass through the SHA-256 deduplication gate.

        Returns:
            (documents, metadatas, ids)
        """
        print("📚 Preparing documents from MongoDB …")
        self._seen_hashes.clear()

        documents: list[str] = []
        metadatas: list[dict] = []
        ids:       list[str] = []

        def add(text: str, meta: dict, id_prefix: str) -> None:
            """Deduplicate then append."""
            if not text or not text.strip():
                return
            if self._is_duplicate(text):
                return
            documents.append(text)
            metadatas.append(meta)
            ids.append(self._make_id(id_prefix))

        laws = list(self.laws_collection.find({}))
        print(f"  Found {len(laws)} law document(s) in MongoDB.")

        for law in laws:
            base_meta  = self._law_base_meta(law)
            law_title  = base_meta["law_title"]
            body       = (law.get("body_text") or law.get("full_text") or "").strip()
            sections   = law.get("sections", [])

            # ── 1. Body chunks ────────────────────────────────────
            if body:
                for idx, chunk in enumerate(self.chunk_text_smart(body)):
                    add(
                        text=f"{law_title}: {chunk}",
                        meta={**base_meta, "chunk_type": "body", "chunk_id": idx,
                              "section_num": "", "section_head": ""},
                        id_prefix=f"body_{law_title}_{idx}",
                    )

            # ── 2. Sections (FIXED mapping + multi-vector) ────────
            if sections and body:
                section_data = self._extract_section_texts(body, sections)

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
                        "chunk_id":     0,
                    }

                    # 2a. Heading-only vector
                    add(
                        text=f"{law_title} — Section {sec_num}: {heading}",
                        meta={**sec_meta_base, "chunk_type": "section_heading"},
                        id_prefix=f"sec_heading_{law_title}_{sec_num}",
                    )

                    # 2b. Heading + body (first 300 words)
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

                    # 2c. First-sentence summary vector
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

                    # Also chunk long section bodies independently
                    if len(sec_text.split()) > 300:
                        for c_idx, chunk in enumerate(
                            self.chunk_text_smart(sec_text, chunk_size=300, overlap=50)
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

            # ── 3. Defined terms ──────────────────────────────────
            for term_obj in law.get("defined_terms", []):
                term       = str(term_obj.get("term", "")).strip()
                definition = str(term_obj.get("definition", "")).strip()
                if not (term and definition):
                    continue
                add(
                    text=f"{law_title} — Definition of '{term}': {definition}",
                    meta={
                        **base_meta,
                        "chunk_type":   "definition",
                        "term":         term,
                        "section_num":  "",
                        "section_head": "",
                        "chunk_id":     0,
                    },
                    id_prefix=f"def_{law_title}_{term}",
                )

            # ── 4. Penalty clauses ────────────────────────────────
            for p_idx, clause in enumerate(law.get("penalty_clauses", [])):
                clause = str(clause).strip()
                if len(clause) < 20:
                    continue
                add(
                    text=f"{law_title} — Penalty: {clause}",
                    meta={
                        **base_meta,
                        "chunk_type":   "penalty",
                        "section_num":  "",
                        "section_head": "",
                        "chunk_id":     p_idx,
                    },
                    id_prefix=f"penalty_{law_title}_{p_idx}",
                )

            # ── 5. Preamble ───────────────────────────────────────
            preamble = (law.get("preamble") or "").strip()
            if len(preamble) > 30:
                add(
                    text=f"{law_title} — Preamble: {preamble}",
                    meta={
                        **base_meta,
                        "chunk_type":   "preamble",
                        "section_num":  "",
                        "section_head": "",
                        "chunk_id":     0,
                    },
                    id_prefix=f"preamble_{law_title}",
                )

            # ── 6. Chapter headings ───────────────────────────────
            for chap in law.get("chapters", []):
                chap_num   = str(chap.get("number", ""))
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
                        "chunk_id":     0,
                    },
                    id_prefix=f"chap_{law_title}_{chap_num}",
                )

        print(f"✅ Prepared {len(documents)} unique chunks across {len(laws)} law(s).")
        return documents, metadatas, ids

    # ─────────────────────────────────────────────────────────────────────────
    #  DATABASE CREATION
    # ─────────────────────────────────────────────────────────────────────────

    def create_vector_database_fast(self, batch_size: int = 100) -> None:
        """
        Build (or rebuild) the ChromaDB vector database and BM25 index.

        Args:
            batch_size: Chunks per ChromaDB add() call.
        """
        print("🔄 Creating vector database …")
        t0 = time.time()

        documents, metadatas, ids = self.prepare_documents()

        if not documents:
            print("❌ No documents to process — is MongoDB empty?")
            return

        total    = len(documents)
        n_batches = (total + batch_size - 1) // batch_size

        for bn in range(n_batches):
            t_b   = time.time()
            start = bn * batch_size
            end   = min(start + batch_size, total)
            self.collection.add(
                documents=documents[start:end],
                metadatas=metadatas[start:end],
                ids=ids[start:end],
            )
            print(f"  ✓ Batch {bn + 1}/{n_batches} "
                  f"({end - start} chunks, {time.time() - t_b:.2f}s)")

        # ── Persist BM25 corpus ───────────────────────────────────
        self._build_bm25_index(documents, ids, metadatas)

        print(f"\n🎉 Vector DB built in {time.time() - t0:.2f}s")
        print(f"📊 Total chunks indexed: {self.collection.count()}")

    # ── 5. BM25 index ─────────────────────────────────────────────────────────

    def _build_bm25_index(
        self,
        documents: list[str],
        ids: list[str],
        metadatas: list[dict],
    ) -> None:
        """Build BM25Okapi index from corpus and pickle it for reuse."""
        if not _BM25_OK:
            return

        print("🔄 Building BM25 index …")
        tokenised = [d.lower().split() for d in documents]
        self._bm25       = BM25Okapi(tokenised)
        self._bm25_ids   = ids
        self._bm25_docs  = documents
        self._bm25_metas = metadatas

        # Persist
        corpus_path = Path(self.chroma_path) / self._BM25_CORPUS_FILE
        with open(corpus_path, "wb") as f:
            pickle.dump(
                {"ids": ids, "documents": documents, "metadatas": metadatas},
                f,
            )
        print(f"✅ BM25 index built ({len(documents)} docs) — saved to {corpus_path}")

    def _load_bm25_index(self) -> bool:
        """
        Load previously pickled BM25 corpus and rebuild the index.
        Returns True on success.
        """
        if not _BM25_OK:
            return False

        corpus_path = Path(self.chroma_path) / self._BM25_CORPUS_FILE
        if not corpus_path.exists():
            print("⚠️  BM25 corpus file not found. "
                  "Run create_vector_database_fast() first.")
            return False

        print("🔄 Loading BM25 corpus from disk …")
        with open(corpus_path, "rb") as f:
            data = pickle.load(f)

        self._bm25_ids   = data["ids"]
        self._bm25_docs  = data["documents"]
        self._bm25_metas = data["metadatas"]
        tokenised        = [d.lower().split() for d in self._bm25_docs]
        self._bm25       = BM25Okapi(tokenised)
        print(f"✅ BM25 index loaded ({len(self._bm25_docs)} docs)")
        return True

    # ─────────────────────────────────────────────────────────────────────────
    #  7. QUERY INTENT CLASSIFICATION
    # ─────────────────────────────────────────────────────────────────────────

    def classify_query_intent(self, query: str) -> str:
        """
        Classify a natural-language query into one of the intent categories:
            'definition' | 'penalty' | 'procedural' | 'bail' | 'general'

        Uses regex pattern matching — fast and deterministic.

        Returns:
            Intent label string.
        """
        q = query.lower()
        for intent, patterns in INTENT_PATTERNS.items():
            if intent == "general":
                continue
            for pat in patterns:
                if re.search(pat, q):
                    return intent
        return "general"

    # ─────────────────────────────────────────────────────────────────────────
    #  SEARCH METHODS
    # ─────────────────────────────────────────────────────────────────────────

    def search_vector(
        self,
        query: str,
        n_results: int = 10,
        where: Optional[dict] = None,
    ) -> list[dict]:
        """
        Pure ChromaDB vector search.

        Args:
            query:     Natural-language query string.
            n_results: Number of results to return.
            where:     Optional ChromaDB metadata filter dict.

        Returns:
            List of result dicts with keys:
                id, document, metadata, score  (cosine similarity, 0-1)
        """
        kwargs: dict = {
            "query_texts": [query],
            "n_results":   n_results,
            "include":     ["documents", "metadatas", "distances"],
        }
        if where:
            kwargs["where"] = where

        raw = self.collection.query(**kwargs)

        results: list[dict] = []
        for doc, meta, dist in zip(
            raw["documents"][0],
            raw["metadatas"][0],
            raw["distances"][0],
        ):
            results.append({
                "id":       "",
                "document": doc,
                "metadata": meta,
                "score":    round(1 - dist, 4),   # cosine similarity
            })
        return results

    def search_bm25(
        self,
        query: str,
        n_results: int = 10,
    ) -> list[dict]:
        """
        BM25 keyword search over the stored corpus.

        Args:
            query:     Query string.
            n_results: Number of results to return.

        Returns:
            List of result dicts (same schema as search_vector),
            or empty list if BM25 is unavailable.
        """
        if not _BM25_OK:
            return []

        # Lazy-load corpus if not already in memory
        if self._bm25 is None:
            if not self._load_bm25_index():
                return []

        tokens = query.lower().split()
        scores = self._bm25.get_scores(tokens)       # type: ignore[union-attr]

        # Pair (score, index) and get top n
        top_n  = sorted(enumerate(scores), key=lambda x: x[1], reverse=True)[:n_results]
        results: list[dict] = []
        for idx, score in top_n:
            if score <= 0:
                continue
            results.append({
                "id":       self._bm25_ids[idx],
                "document": self._bm25_docs[idx],
                "metadata": self._bm25_metas[idx],
                "score":    round(float(score), 4),
            })
        return results

    # ── 5. Hybrid search with RRF ─────────────────────────────────────────────

    @staticmethod
    def _reciprocal_rank_fusion(
        result_lists: list[list[dict]],
        k: int = 60,
    ) -> list[dict]:
        """
        Merge multiple ranked result lists using Reciprocal Rank Fusion.

        RRF score = Σ  1 / (k + rank_i)   for each list i.

        Deduplication key: document text (first 200 chars).

        Args:
            result_lists: Each inner list is a ranked list of result dicts.
            k:            Constant that dampens high rankings (default 60).

        Returns:
            Deduplicated, fused-and-sorted list of result dicts.
        """
        rrf_scores: dict[str, float] = defaultdict(float)
        best_result: dict[str, dict] = {}

        for ranked_list in result_lists:
            for rank, item in enumerate(ranked_list):
                key = item["document"][:200]
                rrf_scores[key] += 1.0 / (k + rank + 1)
                if key not in best_result:
                    best_result[key] = item

        fused = sorted(rrf_scores.items(), key=lambda x: x[1], reverse=True)
        return [
            {**best_result[key], "rrf_score": round(score, 6)}
            for key, score in fused
        ]

    # ── 3. Reranking layer ────────────────────────────────────────────────────

    def _get_reranker(self) -> Optional["CrossEncoder"]:
        """Lazy-load the CrossEncoder reranker."""
        if not _RERANK_OK:
            return None
        if self._reranker is None:
            print(f"🔄 Loading CrossEncoder ({self._reranker_model}) …")
            self._reranker = CrossEncoder(self._reranker_model)
            print("✅ CrossEncoder ready.")
        return self._reranker

    def _rerank(
        self,
        query: str,
        candidates: list[dict],
        top_k: int = 5,
    ) -> list[dict]:
        """
        Rerank candidate results with a cross-encoder.

        Args:
            query:      Original user query.
            candidates: Candidates from vector/BM25/hybrid search.
            top_k:      How many to return after reranking.

        Returns:
            Top-k reranked results with an added 'rerank_score' key.
        """
        reranker = self._get_reranker()
        if reranker is None or not candidates:
            return candidates[:top_k]

        pairs  = [(query, c["document"]) for c in candidates]
        scores = reranker.predict(pairs)

        for c, s in zip(candidates, scores):
            c["rerank_score"] = round(float(s), 4)

        return sorted(candidates, key=lambda x: x["rerank_score"], reverse=True)[:top_k]

    # ── Main public search entry point ────────────────────────────────────────

    def search_hybrid(
        self,
        query: str,
        n_results: int = 5,
        rerank: bool = True,
        n_candidates: int = 20,
        intent_filter: bool = True,
        # FIX #2/#3: accept an explicit ChromaDB where-filter from callers
        # (e.g. retrieve_laws passes chunk_type / category / jurisdiction
        # filters here instead of building a dead variable that was never used)
        where: Optional[dict] = None,
    ) -> list[dict]:
        """
        Full hybrid search: intent classification → BM25 + vector → RRF → rerank.

        Args:
            query:         Natural-language query.
            n_results:     Final number of results to return.
            rerank:        Apply cross-encoder reranking to candidates.
            n_candidates:  How many candidates to retrieve before reranking.
            intent_filter: Apply metadata pre-filter based on query intent.
                           Ignored when ``where`` is provided explicitly.
            where:         Explicit ChromaDB metadata filter dict.  When
                           supplied it overrides intent-based filtering for
                           both the vector and BM25 legs.

        Returns:
            Ranked list of result dicts, each containing:
                document, metadata (with section_num, section_head, law_title,
                chunk_type), score / rrf_score / rerank_score, citation.
        """
        # 7. Classify intent (printed for diagnostics regardless of filter path)
        intent = self.classify_query_intent(query)
        print(f"  🔎 Intent: '{intent}'")

        # Determine the ChromaDB where-filter for the vector leg:
        #   • Explicit caller filter takes precedence.
        #   • Otherwise derive from intent (if intent_filter is on).
        if where is not None:
            where_filter: Optional[dict] = where
        elif intent_filter:
            boosted_types = INTENT_CHUNK_BOOST.get(intent, [])
            where_filter = (
                {"chunk_type": {"$in": boosted_types}}
                if boosted_types
                else None
            )
        else:
            where_filter = None

        # Vector search (with intent / explicit filter on first pass)
        vec_results = self.search_vector(
            query,
            n_results=n_candidates,
            where=where_filter,
        )

        # If filtered results are sparse, complement with unfiltered search
        if len(vec_results) < n_candidates // 2:
            unfiltered = self.search_vector(query, n_results=n_candidates)
            existing   = {r["document"][:200] for r in vec_results}
            vec_results += [r for r in unfiltered
                            if r["document"][:200] not in existing]

        # BM25 search
        bm25_results = self.search_bm25(query, n_results=n_candidates)

        # FIX #4: when an explicit where-filter is provided, apply it to the
        # BM25 results too so both legs are consistent.
        if where is not None:
            bm25_results = self._apply_where_filter(bm25_results, where)

        # RRF fusion
        candidates = self._reciprocal_rank_fusion([vec_results, bm25_results])

        # Reranking
        if rerank:
            final = self._rerank(query, candidates, top_k=n_results)
        else:
            final = candidates[:n_results]

        # 8. Attach citation string
        for r in final:
            r["citation"] = self.format_citation(r)

        return final

    @staticmethod
    def _apply_where_filter(results: list[dict], where: dict) -> list[dict]:
        """
        Post-hoc Python filter that mirrors a simple ChromaDB ``where`` clause.

        Supports:
            {"field": {"$eq": value}}
            {"field": {"$in": [v1, v2]}}
            {"$and": [condition, ...]}

        Used to apply the explicit caller filter to BM25 results (which bypass
        ChromaDB's native where-filtering).
        """
        def matches(meta: dict, clause: dict) -> bool:
            if "$and" in clause:
                return all(matches(meta, c) for c in clause["$and"])
            for field, predicate in clause.items():
                val = meta.get(field, "")
                if isinstance(predicate, dict):
                    if "$eq" in predicate and val != predicate["$eq"]:
                        return False
                    if "$in" in predicate and val not in predicate["$in"]:
                        return False
                elif val != predicate:
                    return False
            return True

        return [r for r in results if matches(r.get("metadata", {}), where)]

    # ─────────────────────────────────────────────────────────────────────────
    #  8. CITATION FORMATTING
    # ─────────────────────────────────────────────────────────────────────────

    def format_citation(self, result: dict) -> str:
        """
        Build a human-readable citation string from a result dict.

        Examples:
            "Pakistan Penal Code — Section 302 (Punishment of murder)"
            "Pakistan Penal Code — Definition of 'adult'"
            "Pakistan Penal Code — Penalty clause"
            "Pakistan Penal Code — Chapter I (Introduction)"

        Args:
            result: A result dict returned by any search method.

        Returns:
            Citation string.
        """
        meta       = result.get("metadata", {})
        law        = meta.get("law_title", "Unknown Law")
        chunk_type = meta.get("chunk_type", "")
        sec_num    = meta.get("section_num", "").strip()
        sec_head   = meta.get("section_head", "").strip()
        term       = meta.get("term", "").strip()
        act        = meta.get("act_number", "")
        year       = meta.get("year", "")

        law_ref = law
        if act and year:
            law_ref = f"{law} (Act {act} of {year})"

        if chunk_type in ("section", "section_heading", "section_summary"):
            if sec_num and sec_head:
                return f"{law_ref} — Section {sec_num} ({sec_head})"
            elif sec_num:
                return f"{law_ref} — Section {sec_num}"

        if chunk_type == "chapter":
            if sec_num and sec_head:
                return f"{law_ref} — {sec_num}: {sec_head}"

        if chunk_type == "definition" and term:
            return f"{law_ref} — Definition of '{term}'"

        if chunk_type == "penalty":
            return f"{law_ref} — Penalty clause"

        if chunk_type == "preamble":
            return f"{law_ref} — Preamble"

        if chunk_type == "body" and sec_num:
            return f"{law_ref} — Section {sec_num}"

        return law_ref


# ══════════════════════════════════════════════════════════════════════════════
#  Smoke-test / CLI entry point
# ══════════════════════════════════════════════════════════════════════════════

def test_local_rag(
    mongodb_uri: str = "mongodb://localhost:27017/",
    db_name: str = "LegisCounsel",
) -> None:
    """
    Build the vector DB then exercise all retrieval modes.
    """
    print("🧪 Testing Enhanced Local RAG System …\n")

    vdb = LocalLawVectorDB(mongodb_uri=mongodb_uri, db_name=db_name)
    vdb.create_vector_database_fast()

    test_queries = [
        ("punishment for murder",         True),
        ("what is the definition of adult", True),
        ("bail conditions Pakistan",       True),
        ("tribunal powers jurisdiction",   False),   # no rerank to save time
        ("scheduled offence meaning",      True),
        ("preamble Pakistan Penal Code",   False),
    ]

    SEP = "─" * 72
    print(f"\n{SEP}")
    print("  HYBRID SEARCH RESULTS")
    print(SEP)

    for query, do_rerank in test_queries:
        intent = vdb.classify_query_intent(query)
        print(f"\n🔍  Query : '{query}'")
        print(f"    Intent: {intent}  |  rerank={do_rerank}")

        results = vdb.search_hybrid(
            query,
            n_results=3,
            rerank=do_rerank,
            intent_filter=True,
        )

        for i, r in enumerate(results, 1):
            score_key = (
                "rerank_score" if "rerank_score" in r
                else "rrf_score" if "rrf_score" in r
                else "score"
            )
            print(f"  {i}. {r['citation']}")
            print(f"     type={r['metadata'].get('chunk_type'):20s}  "
                  f"{score_key}={r.get(score_key, 0):.4f}")
            snippet = r["document"][:120].replace("\n", " ")
            print(f"     {snippet} …")


if __name__ == "__main__":
    test_local_rag()