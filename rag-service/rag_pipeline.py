"""
rag_pipeline.py  (v3)
=====================
RAG Pipeline for Pakistan Legal Assistant.

New in v3
---------
* Section-number detection  — queries like "what is section 53 of PPC?" or
  "section 302 Pakistan Penal Code" trigger a direct MongoDB lookup that
  fetches the exact section text without relying on vector search alone.

* Full section text in law_sources — every law_source entry now carries:
      "full_text"  — the complete raw section text sliced from body_text
      "summary"    — a short AI-generated plain-English legal summary

* summarize_section() — calls the LLM once per unique section to produce a
  concise, legally accurate summary in 2-4 sentences.

* MongoDB connection added to LocalRAG — used only for section lookup and
  full-text retrieval; vector search is still the primary retrieval path.

Return schema for ask() (law_sources entries):
    {
        "type":         "law",
        "chunk_type":   str,
        "law_title":    str,
        "act_number":   str,
        "year":         str,
        "category":     str,
        "jurisdiction": str,
        "section_num":  str,
        "section_head": str,
        "term":         str,
        "citation":     str,
        "full_text":    str,   ← NEW: complete section body from MongoDB
        "summary":      str,   ← NEW: AI legal summary (2-4 sentences)
    }
"""

from __future__ import annotations

import re
from typing import Optional

import requests
import chromadb
from chromadb.utils import embedding_functions
from pymongo import MongoClient

from laws_vector_db_creater import LocalLawVectorDB

# ── Shared bi-encoder (used only for the cases collection) ───────────────────
print("🔄 Loading embedding model …")
embedding_function = embedding_functions.SentenceTransformerEmbeddingFunction(
    model_name="BAAI/bge-base-en-v1.5",
    normalize_embeddings=True,
)
print("✅ Embedding model ready.")

_SECTION_TYPES = {"section", "section_heading", "section_summary"}

# ── Regex to detect explicit section-number queries ───────────────────────────
# Matches patterns like:
#   "section 53"  /  "sec. 302"  /  "s. 144"  /  "Article 6"
_SECTION_NUM_RE = re.compile(
    r'\b(?:section|sec\.?|s\.?|article|art\.?)\s*(\d{1,4}[A-Z]?)\b',
    re.IGNORECASE,
)

# ── Regex to detect an explicit law name in the query ─────────────────────────
# Extend this list as you add more laws.
_LAW_NAME_HINTS: list[tuple[re.Pattern, str]] = [
    (re.compile(r'pakistan\s+penal\s+code|ppc',              re.IGNORECASE), "Pakistan Penal Code"),
    (re.compile(r'code\s+of\s+criminal\s+procedure|cr\.?p\.?c', re.IGNORECASE), "Code of Criminal Procedure"),
    (re.compile(r'constitution\s+of\s+pakistan',             re.IGNORECASE), "Constitution of Pakistan"),
    (re.compile(r'contract\s+act',                           re.IGNORECASE), "Contract Act"),
    (re.compile(r'family\s+laws\s+ordinance|mflo',           re.IGNORECASE), "Muslim Family Laws Ordinance"),
]


class LocalRAG:
    def __init__(
        self,
        laws_db_path:  str = "./law_vector_db",
        cases_db_path: str = "./cases_vector_db",
        mongo_uri:     str = "mongodb://localhost:27017/",
        mongo_db:      str = "LegisCounsel",
        ollama_model:  str = "qwen2.5:3b",
        laws_k:        int = 5,
        cases_k:       int = 3,
        rerank:        bool = True,
        n_candidates:  int = 20,
    ):
        print("🚀 Initialising RAG pipeline (v3) …")

        self.laws_k       = laws_k
        self.cases_k      = cases_k
        self.rerank       = rerank
        self.n_candidates = n_candidates

        # ── Law vector DB ─────────────────────────────────────────────────────
        print(f"  📖 Loading laws vector DB from '{laws_db_path}' …")
        self.law_vdb = LocalLawVectorDB(
            chroma_path=laws_db_path,
            reset_collection=False,
        )
        print(f"     ✓ {self.law_vdb.collection.count()} law chunks loaded.")

        # ── Cases ChromaDB ────────────────────────────────────────────────────
        print(f"  ⚖️  Loading cases DB from '{cases_db_path}' …")
        cases_client = chromadb.PersistentClient(path=cases_db_path)
        self.cases_collection = cases_client.get_collection(
            name="pakistan_law_cases",
            embedding_function=embedding_function,
        )
        print(f"     ✓ {self.cases_collection.count()} case chunks loaded.")

        # ── MongoDB (for full section text lookup) ────────────────────────────
        print(f"  🗄️  Connecting to MongoDB ({mongo_db}) …")
        self._mongo_client = MongoClient(mongo_uri, serverSelectionTimeoutMS=5_000)
        self._laws_col     = self._mongo_client[mongo_db]["laws"]
        print("     ✓ MongoDB ready.")

        # ── Ollama ────────────────────────────────────────────────────────────
        self.ollama_url = "http://localhost:11434/api/generate"
        self.model      = ollama_model

        print("🔥 Warming up LLM …")
        try:
            requests.post(
                self.ollama_url,
                json={"model": self.model, "prompt": "Hello", "stream": False},
                timeout=30,
            )
            print("  ✓ LLM ready.")
        except Exception as exc:
            print(f"  ⚠️  Could not reach Ollama ({exc}). Make sure it is running.")

        print("✅ RAG pipeline ready.\n")

    # ─────────────────────────────────────────────────────────────────────────
    #  SECTION DETECTION
    # ─────────────────────────────────────────────────────────────────────────

    def _detect_section_query(self, query: str) -> tuple[Optional[str], Optional[str]]:
        """
        Check whether the query explicitly mentions a section number and
        optionally a law name.

        Returns:
            (section_num, law_title_hint) — either may be None if not detected.

        Examples:
            "what is section 53 of Pakistan Penal Code?"
                → ("53", "Pakistan Penal Code")
            "punishment under section 302"
                → ("302", None)
            "what is murder in Pakistan law?"
                → (None, None)   ← semantic query, use hybrid search
        """
        m = _SECTION_NUM_RE.search(query)
        if not m:
            return None, None

        sec_num = m.group(1).upper()

        law_hint = None
        for pattern, name in _LAW_NAME_HINTS:
            if pattern.search(query):
                law_hint = name
                break

        return sec_num, law_hint

    # ─────────────────────────────────────────────────────────────────────────
    #  FULL SECTION TEXT FROM MONGODB
    # ─────────────────────────────────────────────────────────────────────────

    def _fetch_section_text_from_mongo(
        self,
        law_title: str,
        section_num: str,
    ) -> str:
        """
        Slice the section's full text directly from MongoDB body_text using
        the character positions stored in the sections array.

        Args:
            law_title:   The law_title / file_stem stored in the MongoDB doc.
            section_num: Section number string (e.g. "53", "302A").

        Returns:
            Full raw section text, or "" if not found.
        """
        doc = self._laws_col.find_one(
            {"$or": [
                {"file_stem":  {"$regex": re.escape(law_title), "$options": "i"}},
                {"title":      {"$regex": re.escape(law_title), "$options": "i"}},
            ]},
            {"body_text": 1, "sections": 1},
        )
        if not doc:
            return ""

        body     = doc.get("body_text", "") or ""
        sections = doc.get("sections",  []) or []
        body_len = len(body)

        # Find the target section and the one after it (to know where it ends)
        sorted_secs = sorted(sections, key=lambda s: int(s.get("position", 0))
                             if str(s.get("position", "0")).isdigit() else 0)

        for i, sec in enumerate(sorted_secs):
            if str(sec.get("number", "")).upper() == section_num.upper():
                start = int(sec.get("position", 0))
                end   = (
                    int(sorted_secs[i + 1].get("position", body_len))
                    if i + 1 < len(sorted_secs)
                    else body_len
                )
                start = max(0, min(start, body_len))
                end   = max(start, min(end, body_len))
                return body[start:end].strip()

        return ""

    def _enrich_law_sources_with_full_text(
        self,
        law_sources: list[dict],
    ) -> list[dict]:
        """
        For every law_source that represents a section, fetch the full section
        text from MongoDB and attach it as 'full_text'.
        Also generate an AI summary for each unique section.
        """
        for source in law_sources:
            ctype   = source.get("chunk_type", "")
            sec_num = source.get("section_num", "")

            # Only fetch full text for section-type chunks that have a number
            if ctype not in (*_SECTION_TYPES, "section", "body") or not sec_num:
                source.setdefault("full_text", "")
                source.setdefault("summary",   "")
                continue

            full_text = self._fetch_section_text_from_mongo(
                law_title   = source.get("law_title", ""),
                section_num = sec_num,
            )
            source["full_text"] = full_text
            source["summary"]   = (
                self.summarize_section(
                    law_title   = source.get("law_title", ""),
                    section_num = sec_num,
                    section_head= source.get("section_head", ""),
                    section_text= full_text,
                )
                if full_text
                else ""
            )

        return law_sources

    # ─────────────────────────────────────────────────────────────────────────
    #  AI LEGAL SUMMARY
    # ─────────────────────────────────────────────────────────────────────────

    def summarize_section(
        self,
        law_title:    str,
        section_num:  str,
        section_head: str,
        section_text: str,
    ) -> str:
        """
        Generate a concise plain-English legal summary for a single section.

        Returns a 2-4 sentence summary suitable for display alongside the
        full section text.
        """
        if not section_text.strip():
            return ""

        # Truncate very long sections to avoid context overflow
        snippet = section_text[:2000]

        prompt = f"""You are a senior Pakistani law expert writing a legal reference guide.

Summarize the following section of {law_title} in 2 to 4 clear, legally precise sentences.
- State what the section establishes, prohibits, or defines.
- Mention the key legal consequence or right if applicable.
- Do NOT add information that is not in the text below.
- Write in formal legal English.

Section {section_num} — {section_head}:
{snippet}

Summary:"""

        try:
            response = requests.post(
                self.ollama_url,
                json={"model": self.model, "prompt": prompt, "stream": False},
                timeout=120,
            )
            return response.json()["response"].strip()
        except Exception as exc:
            print(f"  ⚠️  Summary generation failed for Section {section_num}: {exc}")
            return ""

    # ─────────────────────────────────────────────────────────────────────────
    #  DIRECT SECTION LOOKUP  (bypasses vector search)
    # ─────────────────────────────────────────────────────────────────────────

    def _direct_section_lookup(
        self,
        section_num: str,
        law_hint:    Optional[str],
    ) -> tuple[list[str], list[dict]]:
        """
        When the query explicitly names a section number, fetch that section
        directly from the ChromaDB collection using a metadata filter rather
        than relying purely on semantic search.

        Falls back to unfiltered section-number search if law_hint is not
        recognised or returns no results.

        Returns:
            (docs, metas) — same shape as retrieve_laws()
        """
        conditions: list[dict] = [
            {"section_num": {"$eq": section_num}},
            {"chunk_type":  {"$in": ["section", "section_heading", "section_summary"]}},
        ]
        if law_hint:
            conditions.append({"law_title": {"$eq": law_hint}})

        where = {"$and": conditions} if len(conditions) > 1 else conditions[0]

        try:
            results = self.law_vdb.search_hybrid(
                query        = f"Section {section_num}",
                n_results    = self.laws_k,
                rerank       = self.rerank,
                n_candidates = self.n_candidates,
                intent_filter= False,
                where        = where,
            )
            if results:
                return [r["document"] for r in results], [r["metadata"] for r in results]
        except Exception as exc:
            print(f"  ⚠️  Direct section lookup error: {exc}")

        return [], []

    # ─────────────────────────────────────────────────────────────────────────
    #  Retrieval — Laws
    # ─────────────────────────────────────────────────────────────────────────

    def retrieve_laws(
        self,
        query:        str,
        chunk_type:   Optional[str] = None,
        category:     Optional[str] = None,
        jurisdiction: Optional[str] = None,
        year:         Optional[str] = None,
    ) -> tuple[list[str], list[dict]]:
        conditions: list[dict] = []
        if chunk_type:
            conditions.append({"chunk_type": {"$eq": chunk_type}})
        if category:
            conditions.append({"category": {"$eq": category}})
        if jurisdiction:
            conditions.append({"jurisdiction": {"$eq": jurisdiction}})
        if year:
            conditions.append({"year": {"$eq": str(year)}})

        explicit_filter: Optional[dict] = None
        if conditions:
            explicit_filter = (
                conditions[0] if len(conditions) == 1
                else {"$and": conditions}
            )

        try:
            results = self.law_vdb.search_hybrid(
                query         = query,
                n_results     = self.laws_k,
                rerank        = self.rerank,
                n_candidates  = self.n_candidates,
                intent_filter = (chunk_type is None),
                where         = explicit_filter,
            )
            return [r["document"] for r in results], [r["metadata"] for r in results]
        except Exception as exc:
            print(f"  ⚠️  Laws retrieval error: {exc}")
            return [], []

    # ─────────────────────────────────────────────────────────────────────────
    #  Retrieval — Cases
    # ─────────────────────────────────────────────────────────────────────────

    def retrieve_cases(
        self,
        query:      str,
        chunk_type: Optional[str] = None,
        section:    Optional[str] = None,
        outcome:    Optional[str] = None,
    ) -> tuple[list[str], list[dict]]:
        where: dict = {}
        if chunk_type:
            where["chunk_type"] = {"$eq": chunk_type}
        if outcome:
            where["outcome"]    = {"$eq": outcome}
        if section:
            where["primary_sections"] = {"$contains": section}

        kwargs: dict = dict(query_texts=[query], n_results=self.cases_k)
        if where:
            kwargs["where"] = (
                where if len(where) == 1
                else {"$and": [{k: v} for k, v in where.items()]}
            )

        try:
            res   = self.cases_collection.query(**kwargs)
            docs  = res["documents"][0]
            metas = res["metadatas"][0]
            if not docs and where:
                res   = self.cases_collection.query(
                    query_texts=[query], n_results=self.cases_k
                )
                docs  = res["documents"][0]
                metas = res["metadatas"][0]
            return docs, metas
        except Exception as exc:
            print(f"  ⚠️  Cases retrieval error: {exc}")
            return [], []

    # ─────────────────────────────────────────────────────────────────────────
    #  Prompt Builder
    # ─────────────────────────────────────────────────────────────────────────

    def build_prompt(
        self,
        query:      str,
        law_docs:   list[str],
        case_docs:  list[str],
        law_metas:  list[dict],
        case_metas: list[dict],
        history:    Optional[list[dict]] = None,
        user_role:  str = "client",
    ) -> str:
        history_text = ""
        if history:
            for msg in history[-3:]:
                role = "User" if msg["role"] == "user" else "Assistant"
                history_text += f"{role}: {msg['content']}\n"

        law_blocks: list[str] = []
        for doc, meta in zip(law_docs, law_metas):
            ctype     = meta.get("chunk_type", "body")
            law_title = meta.get("law_title", meta.get("file_stem", "Unknown Law"))
            act_no    = meta.get("act_number", "")
            year      = meta.get("year", "")
            law_ref   = (
                law_title
                + (f" (Act {act_no})" if act_no else "")
                + (f", {year}"        if year   else "")
            )

            if ctype in _SECTION_TYPES:
                sec_num  = meta.get("section_num",  "?")
                sec_head = meta.get("section_head", "")
                label    = {
                    "section":         "Section",
                    "section_heading": "Section (heading)",
                    "section_summary": "Section (summary)",
                }.get(ctype, "Section")
                header = f"[{law_ref} | {label} {sec_num}: {sec_head}]"
            elif ctype == "definition":
                term   = meta.get("term", "?")
                header = f"[{law_ref} | Definition of '{term}']"
            elif ctype == "penalty":
                header = f"[{law_ref} | Penalty Clause]"
            elif ctype == "preamble":
                header = f"[{law_ref} | Preamble]"
            elif ctype == "chapter":
                chap_num  = meta.get("section_num",  "")
                chap_head = meta.get("section_head", "")
                header    = f"[{law_ref} | {chap_num}: {chap_head}]"
            else:
                header = f"[{law_ref} | General Provision]"

            law_blocks.append(f"{header}\n{doc}")

        laws_context = (
            "\n\n".join(law_blocks) if law_blocks else "No relevant law sections found."
        )

        case_blocks: list[str] = []
        for doc, meta in zip(case_docs, case_metas):
            citation = meta.get("citation", "Unknown")
            court    = meta.get("court",    "")
            outcome  = meta.get("outcome",  "")
            ctype    = meta.get("chunk_type", "")
            header   = f"[{citation} | {court} | Outcome: {outcome} | {ctype}]"
            case_blocks.append(f"{header}\n{doc}")

        cases_context = (
            "\n\n".join(case_blocks) if case_blocks else "No relevant cases found."
        )

        shared_instructions = (
            "- Cite the specific law section(s) that apply "
            "(e.g. \"Section 302 PPC\").\n"
            "- Reference at least one case judgement if relevant, "
            "quoting the citation and outcome.\n"
            "- If cases show conflicting outcomes, mention both and "
            "explain the distinction."
        )

        if user_role == "client":
            role_desc   = "a client (a non-lawyer who needs plain-language explanations)"
            extra_instr = (
                "- Explain in the clearest, simplest language what the law "
                "says and how courts have applied it.\n"
                "- Structure your answer: Law → Case precedent → "
                "Plain-language conclusion."
            )
        else:
            role_desc   = "a lawyer with legal research"
            extra_instr = (
                "- Explain how the law applies to the question and highlight "
                "any judicial nuances.\n"
                "- Provide a structured, research-grade answer suitable for "
                "use in legal proceedings."
            )

        return f"""You are an expert legal assistant specialising in Pakistani law, \
assisting {role_desc}.
Use ONLY the information in the sections below to answer the question.
If the answer is not present in the provided context, say \
"Not found in provided context." Do NOT guess or add outside information.

============================
CONVERSATION HISTORY
============================
{history_text if history_text else "(none)"}

============================
RELEVANT LAW SECTIONS
============================
{laws_context}

============================
RELEVANT CASE JUDGEMENTS
============================
{cases_context}

============================
QUESTION
============================
{query}

============================
INSTRUCTIONS
============================
{shared_instructions}
{extra_instr}

Answer:"""

    # ─────────────────────────────────────────────────────────────────────────
    #  LLM Generation
    # ─────────────────────────────────────────────────────────────────────────

    def generate(self, prompt: str) -> str:
        response = requests.post(
            self.ollama_url,
            json={"model": self.model, "prompt": prompt, "stream": False},
            timeout=1200,
        )
        return response.json()["response"]

    # ─────────────────────────────────────────────────────────────────────────
    #  Query Rewriting
    # ─────────────────────────────────────────────────────────────────────────

    def rewrite_query(self, query: str, history: Optional[list[dict]]) -> str:
        if not history:
            return query

        print("🔄 Rewriting query with conversation context …")
        history_text = ""
        for msg in history[-3:]:
            role = "User" if msg["role"] == "user" else "Assistant"
            history_text += f"{role}: {msg['content']}\n"

        prompt = f"""Rewrite the follow-up question as a clear, concise, \
fully self-contained standalone question.
- Use only relevant context from the conversation history.
- Preserve the original intent exactly.
- Do not add assumptions or unnecessary detail.

Conversation History:
{history_text}

Follow-up Question:
{query}

Standalone Question:"""

        response = requests.post(
            self.ollama_url,
            json={"model": self.model, "prompt": prompt, "stream": False},
            timeout=120,
        )
        rewritten = response.json()["response"].strip()
        print(f"   → {rewritten}")
        return rewritten

    # ─────────────────────────────────────────────────────────────────────────
    #  MAIN ENTRY POINT
    # ─────────────────────────────────────────────────────────────────────────

    def ask(
        self,
        query:            str,
        history:          Optional[list[dict]] = None,
        user_role:        str = "client",
        law_chunk_type:   Optional[str] = None,
        law_category:     Optional[str] = None,
        law_jurisdiction: Optional[str] = None,
        law_year:         Optional[str] = None,
        case_section:     Optional[str] = None,
        case_outcome:     Optional[str] = None,
        case_chunk_type:  Optional[str] = None,
    ) -> dict:
        """
        Full RAG pipeline: rewrite → detect section → retrieve → prompt → generate → structure.

        Returns
        -------
        {
            "answer":       str,
            "law_sources":  [
                {
                    "type", "chunk_type", "law_title", "act_number", "year",
                    "category", "jurisdiction", "section_num", "section_head",
                    "term", "citation",
                    "full_text": str,   ← complete section body from MongoDB
                    "summary":  str,    ← AI-generated 2-4 sentence legal summary
                }, ...
            ],
            "case_sources": [
                { "type", "citation", "court", "outcome", "sections" }, ...
            ],
            "section_detected": str | None,   ← section number if explicitly queried
        }
        """
        # ── 1. Rewrite query ──────────────────────────────────────────────────
        retrieval_query = self.rewrite_query(query, history or [])

        # ── 2. Detect explicit section reference ──────────────────────────────
        sec_num, law_hint = self._detect_section_query(retrieval_query)
        if sec_num:
            print(f"\n🔢 Explicit section detected: Section {sec_num}"
                  f"{f' of {law_hint}' if law_hint else ''}")

        intent = self.law_vdb.classify_query_intent(retrieval_query)
        print(f"\n🧭 Query intent: '{intent}'")

        # ── 3. Retrieve laws ──────────────────────────────────────────────────
        print(f'\n🔍 Retrieving laws for: "{retrieval_query[:80]}"')

        if sec_num:
            # Direct metadata lookup — precise and fast
            law_docs, law_metas = self._direct_section_lookup(sec_num, law_hint)

            # Complement with hybrid search if direct lookup found nothing
            if not law_docs:
                print("   ↩  Direct lookup found nothing — falling back to hybrid search.")
                law_docs, law_metas = self.retrieve_laws(
                    retrieval_query,
                    chunk_type   = law_chunk_type,
                    category     = law_category,
                    jurisdiction = law_jurisdiction,
                    year         = law_year,
                )
        else:
            law_docs, law_metas = self.retrieve_laws(
                retrieval_query,
                chunk_type   = law_chunk_type,
                category     = law_category,
                jurisdiction = law_jurisdiction,
                year         = law_year,
            )

        print(f"   ✓ {len(law_docs)} law chunk(s) retrieved.")
        for m in law_metas:
            ctype = m.get("chunk_type", "body")
            label = m.get("section_num", m.get("term", ""))
            print(f"     • [{ctype:16s}]  {m.get('law_title', '')}  {label}")

        # ── 4. Retrieve cases ─────────────────────────────────────────────────
        print(f'\n⚖️  Retrieving cases for: "{retrieval_query[:80]}"')
        case_docs, case_metas = self.retrieve_cases(
            retrieval_query,
            chunk_type = case_chunk_type,
            section    = case_section or (f"Section {sec_num}" if sec_num else None),
            outcome    = case_outcome,
        )
        print(f"   ✓ {len(case_docs)} case chunk(s) retrieved.")
        for m in case_metas:
            print(f"     • {m.get('citation','?')} | {m.get('court','?')} "
                  f"| {m.get('outcome','?')} [{m.get('chunk_type','?')}]")

        # ── 5. Build prompt and generate ──────────────────────────────────────
        print("\n💬 Generating answer …")
        prompt = self.build_prompt(
            query      = retrieval_query,
            law_docs   = law_docs,
            case_docs  = case_docs,
            law_metas  = law_metas,
            case_metas = case_metas,
            history    = history,
            user_role  = user_role,
        )
        answer = self.generate(prompt)

        # ── 6. Structure law sources ──────────────────────────────────────────
        seen_law_keys: set[str] = set()
        law_sources:   list[dict] = []

        for m in law_metas:
            ctype     = m.get("chunk_type", "body")
            law_title = m.get("law_title",  m.get("file_stem", ""))
            sec_n     = m.get("section_num",  "")
            term      = m.get("term", "")

            dedup_key = f"{law_title}|{ctype}|{sec_n or term}"
            if dedup_key in seen_law_keys:
                continue
            seen_law_keys.add(dedup_key)

            fake_result = {"metadata": m, "document": ""}
            citation    = self.law_vdb.format_citation(fake_result)

            law_sources.append({
                "type":         "law",
                "chunk_type":   ctype,
                "law_title":    law_title,
                "act_number":   m.get("act_number",   ""),
                "year":         m.get("year",         ""),
                "category":     m.get("category",     ""),
                "jurisdiction": m.get("jurisdiction", ""),
                "section_num":  sec_n,
                "section_head": m.get("section_head", ""),
                "term":         term,
                "citation":     citation,
                # full_text and summary filled in below
                "full_text":    "",
                "summary":      "",
            })

        # ── 7. Enrich law sources with full text + AI summary ─────────────────
        print("\n📄 Fetching full section texts and generating summaries …")
        law_sources = self._enrich_law_sources_with_full_text(law_sources)

        # ── 8. Structure case sources ─────────────────────────────────────────
        seen_citations: set[str] = set()
        case_sources:   list[dict] = []

        for m in case_metas:
            citation = m.get("citation", "")
            if not citation or citation in seen_citations:
                continue
            seen_citations.add(citation)

            raw_sections = m.get("primary_sections", "")
            sections_str = (
                ", ".join(raw_sections)
                if isinstance(raw_sections, list)
                else str(raw_sections)
            )

            case_sources.append({
                "type":     "case",
                "citation": citation,
                "court":    m.get("court",   ""),
                "outcome":  m.get("outcome", ""),
                "sections": sections_str,
            })

        return {
            "answer":           answer,
            "law_sources":      law_sources,
            "case_sources":     case_sources,
            "section_detected": sec_num,   # None for semantic queries
        }


# ─────────────────────────────────────────────────────────────────────────────
#  Quick interactive demo
# ─────────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    rag     = LocalRAG()
    history: list[dict] = []

    print("Pakistan Legal Assistant  (type 'quit' to exit)\n")
    print("─" * 60)

    while True:
        try:
            query = input("\n🧑 You: ").strip()
        except (EOFError, KeyboardInterrupt):
            print("\nGoodbye.")
            break

        if not query:
            continue
        if query.lower() in ("quit", "exit", "q"):
            print("Goodbye.")
            break

        result = rag.ask(query, history=history or None, user_role="client")

        print(f"\n🤖 Assistant:\n{result['answer']}")

        if result.get("section_detected"):
            print(f"\n🔢 Section matched: {result['section_detected']}")

        print("\n📖 Law refs:")
        for s in result["law_sources"]:
            print(f"   [{s['chunk_type']:16s}] {s['citation']}")
            if s.get("summary"):
                print(f"   📝 Summary: {s['summary'][:120]} …")
            if s.get("full_text"):
                print(f"   📄 Full text ({len(s['full_text'])} chars available)")

        print("⚖️  Case refs:")
        for s in result["case_sources"]:
            print(f"   {s['citation']}  ({s['court']}, {s['outcome']})")
        print("─" * 60)

        history.append({"role": "user",      "content": query})
        history.append({"role": "assistant", "content": result["answer"]})