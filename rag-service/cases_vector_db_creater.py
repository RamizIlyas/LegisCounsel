"""
Law Cases / Judgements — MongoDB → ChromaDB Vector DB
======================================================
Reads the cases collection from MongoDB (built by law_cases_extractor.py),
chunks each judgement intelligently, embeds them, and stores in ChromaDB
ready for a RAG pipeline.

Chunking strategy (3 chunk types per case):
  1. SUMMARY  – citation + parties + court + headnotes   (dense facts)
  2. HEADNOTE – each headnote bullet as its own chunk    (legal issues)
  3. JUDGMENT – sliding-window chunks of the judgment body

Requirements:
    pip install pymongo chromadb sentence-transformers tqdm

Usage:
    # Build (or rebuild) from scratch
    python cases_vector_db.py

    # Skip rebuild if DB already populated; just run test queries
    python cases_vector_db.py --skip-build

    # Point at non-default MongoDB / ChromaDB paths
    python cases_vector_db.py --mongo mongodb://localhost:27017/ --db pakistan_law_db --chroma ./cases_vector_db
"""

import argparse
import sys
import time
import uuid

# ── Third-party ───────────────────────────────────────────────────────────────
try:
    from pymongo import MongoClient
except ImportError:
    sys.exit("pymongo not found. Run: pip install pymongo")

try:
    import chromadb
    from chromadb.utils import embedding_functions
except ImportError:
    sys.exit("chromadb not found. Run: pip install chromadb")

try:
    from tqdm import tqdm
    TQDM = True
except ImportError:
    TQDM = False


# ═══════════════════════════════════════════════════════════════════════════════
#  SECTION 1 – Chunking helpers
# ═══════════════════════════════════════════════════════════════════════════════

def chunk_text(text: str, chunk_size: int = 350, overlap: int = 60) -> list[str]:
    """
    Sliding-window word-level chunker.
    chunk_size : words per chunk
    overlap    : words shared between consecutive chunks (context continuity)
    """
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


def build_summary_text(doc: dict) -> str:
    """
    Compact, fact-dense representation of a case – ideal for high-level
    retrieval (e.g. 'bail cases under 302 PPC acquitted by Lahore High Court').
    """
    parts = []
    if doc.get("citation"):
        parts.append(f"Citation: {doc['citation']}.")
    if doc.get("court"):
        parts.append(f"Court: {doc['court']}.")
    if doc.get("appellant") or doc.get("respondent"):
        parts.append(
            f"Parties: {doc.get('appellant', 'Unknown')} vs {doc.get('respondent', 'Unknown')}."
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
        summary_hn = (hn[:3] if isinstance(hn, list) else [hn])
        parts.append("Key issues: " + " | ".join(summary_hn))
    return " ".join(parts)


def build_base_metadata(doc: dict) -> dict:
    """
    Fields stored alongside every chunk for filtering / display.
    ChromaDB metadata values must be str | int | float | bool.
    """
    def _str(v) -> str:
        if isinstance(v, list):
            return ", ".join(str(x) for x in v)
        return str(v) if v else ""

    return {
        "citation":        _str(doc.get("citation")),
        "case_name":       _str(doc.get("case_name")),
        "court":           _str(doc.get("court")),
        "appellant":       _str(doc.get("appellant")),
        "respondent":      _str(doc.get("respondent")),
        "law_code":        _str(doc.get("law_code")),
        "primary_sections":_str(doc.get("primary_sections")),
        "all_sections":    _str(doc.get("all_sections_cited")),
        "outcome":         _str(doc.get("outcome")),
        "decision_date":   _str(doc.get("decision_date")),
        "judges":          _str(doc.get("judges")),
        "source":          "Pakistan Court Judgements",
    }


# ═══════════════════════════════════════════════════════════════════════════════
#  SECTION 2 – Document preparation (3 chunk types)
# ═══════════════════════════════════════════════════════════════════════════════

def prepare_chunks(cases_cursor, chunk_size: int, overlap: int):
    """
    Generator: yields (text, metadata, id) tuples for every chunk
    produced from all cases.

    Chunk types
    -----------
    summary   – one chunk per case: citation + parties + outcome + headnotes
    headnote  – one chunk per headnote bullet point
    judgment  – sliding-window chunks of the judgment body text
    """
    total_cases = 0
    total_chunks = 0

    for doc in cases_cursor:
        total_cases += 1
        base_meta = build_base_metadata(doc)
        citation  = doc.get("citation") or doc.get("original_filename", "unknown")
        safe_id   = citation.replace(" ", "_").replace("/", "-")[:60]

        # ── 1. SUMMARY chunk ─────────────────────────────────────────────────
        summary_text = build_summary_text(doc)
        if summary_text.strip():
            yield (
                summary_text,
                {**base_meta, "chunk_type": "summary", "chunk_index": 0},
                f"sum_{safe_id}_{uuid.uuid4().hex[:6]}",
            )
            total_chunks += 1

        # ── 2. HEADNOTE chunks ───────────────────────────────────────────────
        headnotes = doc.get("headnotes", [])
        if isinstance(headnotes, str):
            headnotes = [headnotes]
        for idx, hn in enumerate(headnotes):
            hn = hn.strip()
            if len(hn) < 20:
                continue
            text = f"[{citation}] Legal issue: {hn}"
            yield (
                text,
                {**base_meta, "chunk_type": "headnote", "chunk_index": idx},
                f"hn_{safe_id}_{idx}_{uuid.uuid4().hex[:6]}",
            )
            total_chunks += 1

        # ── 3. JUDGMENT body chunks ──────────────────────────────────────────
        judgment = doc.get("judgment_text", "") or doc.get("full_text", "")
        if judgment:
            for idx, chunk in enumerate(chunk_text(judgment, chunk_size, overlap)):
                if len(chunk.split()) < 20:      # skip tiny trailing fragments
                    continue
                text = f"[{citation}] {chunk}"
                yield (
                    text,
                    {**base_meta, "chunk_type": "judgment", "chunk_index": idx},
                    f"jdg_{safe_id}_{idx}_{uuid.uuid4().hex[:6]}",
                )
                total_chunks += 1

    print(f"  ✓ {total_cases} cases → {total_chunks} chunks")


# ═══════════════════════════════════════════════════════════════════════════════
#  SECTION 3 – ChromaDB manager
# ═══════════════════════════════════════════════════════════════════════════════

COLLECTION_NAME = "pakistan_law_cases"


class CasesVectorDB:
    def __init__(
        self,
        mongo_uri:   str = "mongodb://localhost:27017/",
        db_name:     str = "pakistan_law_db",
        chroma_path: str = "./cases_vector_db",
        model_name:  str = "BAAI/bge-base-en-v1.5",
        batch_size:  int = 64,
        chunk_size:  int = 350,
        overlap:     int = 60,
    ):
        self.batch_size  = batch_size
        self.chunk_size  = chunk_size
        self.overlap     = overlap

        # ── MongoDB ───────────────────────────────────────────────────────────
        print("🔌 Connecting to MongoDB …")
        self.mongo  = MongoClient(mongo_uri, serverSelectionTimeoutMS=5000)
        self.mongo.admin.command("ping")
        self.cases_col = self.mongo[db_name]["cases"]
        n = self.cases_col.count_documents({})
        print(f"  ✓ MongoDB ready — {n} cases in collection")

        # ── Embedding model (loaded ONCE) ─────────────────────────────────────
        print(f"🧠 Loading embedding model '{model_name}' …")
        t0 = time.time()
        self.embed_fn = embedding_functions.SentenceTransformerEmbeddingFunction(
            model_name=model_name,
            normalize_embeddings=True,
        )
        print(f"  ✓ Model loaded in {time.time() - t0:.1f}s")

        # ── ChromaDB ──────────────────────────────────────────────────────────
        print(f"📂 Opening ChromaDB at '{chroma_path}' …")
        self.chroma = chromadb.PersistentClient(path=chroma_path)

    # ── Collection helpers ────────────────────────────────────────────────────
    def _get_or_create(self) -> chromadb.Collection:
        return self.chroma.get_or_create_collection(
            name=COLLECTION_NAME,
            embedding_function=self.embed_fn,
            metadata={"hnsw:space": "cosine"},
        )

    def _drop_and_create(self) -> chromadb.Collection:
        try:
            self.chroma.delete_collection(COLLECTION_NAME)
            print(f"  ✓ Dropped existing collection '{COLLECTION_NAME}'")
        except Exception:
            pass
        return self._get_or_create()

    # ── Build ─────────────────────────────────────────────────────────────────
    def build(self, rebuild: bool = True):
        """
        Pull all cases from MongoDB, chunk them, embed, and store in ChromaDB.
        rebuild=True  → drop the collection first (clean slate)
        rebuild=False → skip if already populated
        """
        collection = self._drop_and_create() if rebuild else self._get_or_create()

        if not rebuild and collection.count() > 0:
            print(f"⚡ Skipping build — collection already has {collection.count()} chunks")
            self.collection = collection
            return

        print("\n📚 Chunking cases from MongoDB …")
        cursor = self.cases_col.find(
            {},
            {   # Only fetch fields we actually need (saves memory on large DBs)
                "citation": 1, "case_name": 1, "court": 1,
                "appellant": 1, "respondent": 1,
                "law_code": 1, "primary_sections": 1, "all_sections_cited": 1,
                "outcome": 1, "decision_date": 1, "judges": 1,
                "headnotes": 1, "judgment_text": 1,
                "original_filename": 1,
            }
        )

        # Materialise chunks (generator → lists)
        texts, metas, ids = [], [], []
        for text, meta, cid in prepare_chunks(cursor, self.chunk_size, self.overlap):
            texts.append(text)
            metas.append(meta)
            ids.append(cid)

        if not texts:
            print("❌ No chunks produced — is the cases collection empty?")
            return

        # ── Batch-add to ChromaDB ─────────────────────────────────────────────
        print(f"\n💾 Embedding & storing {len(texts)} chunks "
              f"(batch={self.batch_size}) …")
        t0 = time.time()
        iterator = range(0, len(texts), self.batch_size)
        if TQDM:
            iterator = tqdm(iterator, desc="Batches", unit="batch")

        for i in iterator:
            sl = slice(i, i + self.batch_size)
            collection.add(
                documents=texts[sl],
                metadatas=metas[sl],
                ids=ids[sl],
            )

        elapsed = time.time() - t0
        print(f"\n🎉 Done! {collection.count()} chunks stored in {elapsed:.1f}s")
        self.collection = collection

    # ── Search ────────────────────────────────────────────────────────────────
    def search(
        self,
        query:       str,
        n_results:   int  = 5,
        chunk_type:  str  = None,   # "summary" | "headnote" | "judgment" | None
        law_code:    str  = None,   # "PPC" | "CrPC" | None
        section:     str  = None,   # e.g. "302" — matches primary_sections
        outcome:     str  = None,   # e.g. "Acquitted"
    ) -> list[dict]:
        """
        Semantic search with optional metadata pre-filters.
        Returns a list of result dicts.
        """
        where = {}
        if chunk_type:
            where["chunk_type"] = {"$eq": chunk_type}
        if law_code:
            where["law_code"] = {"$eq": law_code}
        if outcome:
            where["outcome"] = {"$eq": outcome}
        if section:
            # primary_sections is stored as a comma-separated string
            where["primary_sections"] = {"$contains": section}

        kwargs = dict(
            query_texts=[query],
            n_results=n_results,
        )
        if where:
            kwargs["where"] = where if len(where) == 1 \
                else {"$and": [{k: v} for k, v in where.items()]}

        results = self.collection.query(**kwargs)
        output = []
        for doc, meta, dist in zip(
            results["documents"][0],
            results["metadatas"][0],
            results["distances"][0],
        ):
            output.append({
                "score":        round(1 - dist, 4),   # cosine similarity
                "citation":     meta.get("citation"),
                "court":        meta.get("court"),
                "outcome":      meta.get("outcome"),
                "chunk_type":   meta.get("chunk_type"),
                "sections":     meta.get("primary_sections"),
                "snippet":      doc[:200],
            })
        return output

    def close(self):
        self.mongo.close()


# ═══════════════════════════════════════════════════════════════════════════════
#  SECTION 4 – Demo queries
# ═══════════════════════════════════════════════════════════════════════════════

def run_demo(vdb: CasesVectorDB):
    print("\n" + "═" * 64)
    print("  DEMO QUERIES")
    print("═" * 64)

    queries = [
        # (label, query, filters)
        ("Murder + previous enmity",
         "murder conviction previous enmity ocular evidence",
         {}),

        ("Bail granted under 302 PPC",
         "bail granted accused murder case",
         {"chunk_type": "summary", "section": "302"}),

        ("Acquittal — conflicting evidence",
         "accused acquitted due to conflicting medical and ocular evidence",
         {"outcome": "Acquitted"}),

        ("Cheque dishonour / fraud",
         "dishonoured cheque fraud financial crime punishment",
         {"law_code": "PPC"}),

        ("Bail refused — heinous offence",
         "bail refused heinous serious offence safety of society",
         {"chunk_type": "headnote"}),
    ]

    for label, query, filters in queries:
        print(f"\n🔍 {label}")
        print(f"   Query : \"{query}\"")
        if filters:
            print(f"   Filter: {filters}")
        results = vdb.search(query, n_results=3, **filters)
        if not results:
            print("   (no results)")
            continue
        for i, r in enumerate(results, 1):
            print(f"   {i}. [{r['score']:.3f}] {r['citation']} | {r['court']}")
            print(f"      Outcome: {r['outcome']} | Type: {r['chunk_type']}")
            print(f"      → {r['snippet'][:120]} …")


# ═══════════════════════════════════════════════════════════════════════════════
#  SECTION 5 – CLI
# ═══════════════════════════════════════════════════════════════════════════════

def parse_args():
    p = argparse.ArgumentParser(
        description="Build a ChromaDB vector database from the law cases MongoDB collection."
    )
    p.add_argument("--mongo",      default="mongodb://localhost:27017/",
                   help="MongoDB URI")
    p.add_argument("--db",         default="pakistan_law_db",
                   help="MongoDB database name")
    p.add_argument("--chroma",     default="./cases_vector_db",
                   help="ChromaDB persistence directory")
    p.add_argument("--model",      default="BAAI/bge-base-en-v1.5",
                   help="SentenceTransformer model name")
    p.add_argument("--batch-size", type=int, default=64,
                   help="Chunks per ChromaDB add() call")
    p.add_argument("--chunk-size", type=int, default=350,
                   help="Words per judgment chunk")
    p.add_argument("--overlap",    type=int, default=60,
                   help="Overlap words between consecutive chunks")
    p.add_argument("--skip-build", action="store_true",
                   help="Skip building if the collection is already populated")
    p.add_argument("--demo",       action="store_true",
                   help="Run demo queries after building")
    return p.parse_args()


def main():
    args = parse_args()

    print("\n" + "═" * 64)
    print("  LAW CASES → CHROMADB VECTOR DB")
    print("═" * 64)
    print(f"  MongoDB  : {args.mongo}  DB: {args.db}")
    print(f"  ChromaDB : {args.chroma}")
    print(f"  Model    : {args.model}")
    print(f"  Chunks   : size={args.chunk_size}  overlap={args.overlap}")
    print("═" * 64 + "\n")

    vdb = CasesVectorDB(
        mongo_uri   = args.mongo,
        db_name     = args.db,
        chroma_path = args.chroma,
        model_name  = args.model,
        batch_size  = args.batch_size,
        chunk_size  = args.chunk_size,
        overlap     = args.overlap,
    )

    vdb.build(rebuild=not args.skip_build)

    if args.demo:
        run_demo(vdb)

    vdb.close()
    print("\n  ✅ All done.\n")


if __name__ == "__main__":
    main()