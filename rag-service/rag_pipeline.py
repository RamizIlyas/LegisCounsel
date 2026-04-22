# rag_pipeline.py
# RAG Pipeline for Pakistan Legal Assistant
# Retrieves relevant law sections from the Penal Code vector DB
# AND relevant case judgements from the cases vector DB,
# then combines both into a single grounded LLM prompt.
# ask() now returns a structured dict with answer + law_sources + case_sources.

import chromadb
from chromadb.utils import embedding_functions
import requests

# ── Shared embedding function (loaded ONCE for both collections) ──────────────
print("🔄 Loading embedding model …")
embedding_function = embedding_functions.SentenceTransformerEmbeddingFunction(
    model_name="BAAI/bge-base-en-v1.5",
    normalize_embeddings=True
)
print("✅ Embedding model ready.")


class LocalRAG:
    def __init__(
        self,
        laws_db_path:  str = "./law_vector_db",
        cases_db_path: str = "./cases_vector_db",
        ollama_model:  str = "qwen2.5:3b",
        laws_k:        int = 3,
        cases_k:       int = 3,
    ):
        print("🚀 Initializing RAG pipeline …")

        self.laws_k  = laws_k
        self.cases_k = cases_k

        # ── Laws ChromaDB ─────────────────────────────────────────────────────
        print(f"  📖 Loading laws DB from '{laws_db_path}' …")
        laws_client = chromadb.PersistentClient(path=laws_db_path)
        self.laws_collection = laws_client.get_collection(
            name="pakistan_penal_code",
            embedding_function=embedding_function,
        )
        print(f"     ✓ {self.laws_collection.count()} law chunks loaded.")

        # ── Cases ChromaDB ────────────────────────────────────────────────────
        print(f"  ⚖️  Loading cases DB from '{cases_db_path}' …")
        cases_client = chromadb.PersistentClient(path=cases_db_path)
        self.cases_collection = cases_client.get_collection(
            name="pakistan_law_cases",
            embedding_function=embedding_function,
        )
        print(f"     ✓ {self.cases_collection.count()} case chunks loaded.")

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
        except Exception as e:
            print(f"  ⚠️  Could not reach Ollama ({e}). Make sure it is running.")

        print("✅ RAG pipeline ready.\n")

    # ─────────────────────────────────────────────────────────────────────────
    # Retrieval
    # ─────────────────────────────────────────────────────────────────────────

    def retrieve_laws(self, query: str) -> tuple[list[str], list[dict]]:
        res = self.laws_collection.query(
            query_texts=[query],
            n_results=self.laws_k,
        )
        return res["documents"][0], res["metadatas"][0]

    def retrieve_cases(
        self,
        query:      str,
        chunk_type: str = None,
        section:    str = None,
        outcome:    str = None,
    ) -> tuple[list[str], list[dict]]:
        where = {}
        if chunk_type:
            where["chunk_type"] = {"$eq": chunk_type}
        if outcome:
            where["outcome"] = {"$eq": outcome}
        if section:
            where["primary_sections"] = {"$contains": section}

        kwargs = dict(query_texts=[query], n_results=self.cases_k)
        if where:
            kwargs["where"] = (
                where if len(where) == 1
                else {"$and": [{k: v} for k, v in where.items()]}
            )

        try:
            res   = self.cases_collection.query(**kwargs)
            docs  = res["documents"][0]
            metas = res["metadatas"][0]
            if not docs and where:           # retry without filters
                res   = self.cases_collection.query(
                    query_texts=[query], n_results=self.cases_k
                )
                docs  = res["documents"][0]
                metas = res["metadatas"][0]
            return docs, metas
        except Exception as e:
            print(f"  ⚠️  Cases retrieval error: {e}")
            return [], []

    # ─────────────────────────────────────────────────────────────────────────
    # Prompt builder
    # ─────────────────────────────────────────────────────────────────────────

    def build_prompt(
        self,
        query:      str,
        law_docs:   list[str],
        case_docs:  list[str],
        law_metas:  list[dict],
        case_metas: list[dict],
        history:    list[dict] = None,
        user_role: str = "client",
    ) -> str:
        history_text = ""
        if history:
            for msg in history[-3:]:
                role = "User" if msg["role"] == "user" else "Assistant"
                history_text += f"{role}: {msg['content']}\n"

        law_blocks = []
        for doc, meta in zip(law_docs, law_metas):
            sec   = meta.get("section_number", "?")
            title = meta.get("section_title", "")
            law_blocks.append(f"[Section {sec} – {title}]\n{doc}")
        laws_context = "\n\n".join(law_blocks) if law_blocks else "No relevant law sections found."

        case_blocks = []
        for doc, meta in zip(case_docs, case_metas):
            citation = meta.get("citation", "Unknown")
            court    = meta.get("court", "")
            outcome  = meta.get("outcome", "")
            ctype    = meta.get("chunk_type", "")
            header   = f"[{citation} | {court} | Outcome: {outcome} | {ctype}]"
            case_blocks.append(f"{header}\n{doc}")
        cases_context = "\n\n".join(case_blocks) if case_blocks else "No relevant cases found."
        
        if user_role == 'client':
            prompt = f"""You are an expert legal assistant specialising in Pakistani law, assisting a client(normal person with little or no knowledge of laws and it's terms).
                Use ONLY the information in the sections below to answer the question.
                If the answer is not present in the provided context or conversation history,
                say "Not found in provided context." Do NOT guess or introduce outside information.

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
                - Cite the specific law section(s) that apply (e.g. "Section 302 PPC").
                - Reference at least one case judgement if relevant, quoting the citation and outcome while relating to the question.
                - Explain in clear, most simplest language what the law says and how the courts have interpreted it.
                - If the cases show conflicting outcomes, mention both and explain the distinction.
                - Keep your answer structured: Law → Case precedent → Plain-language conclusion.

                Answer:"""
        else:
            prompt = f"""You are an expert legal assistant specialising in Pakistani law, assisting a lawyer with legal research.
                Use ONLY the information in the sections below to answer the question.
                If the answer is not present in the provided context or conversation history,
                say "Not found in provided context." Do NOT guess or introduce outside information.

                ============================
                CONVERSATION HISTORY
                ============================
                {history_text if history_text else "(none)"}

                ============================
                RELEVANT LAW SECTIONS (Pakistan Penal Code / CrPC)
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
                - Cite the specific law section(s) that apply (e.g. "Section 302 PPC").
                - Reference at least one case judgement if relevant, quoting the citation and outcome.
                - Explain how the law applies to the question, referencing any nuances in the cases.
                - If the cases show conflicting outcomes, mention both and explain the distinction.
                - Provide a structured answer that a lawyer can use for their research.

                Answer:"""
            
        return prompt

    # ─────────────────────────────────────────────────────────────────────────
    # LLM generation
    # ─────────────────────────────────────────────────────────────────────────

    def generate(self, prompt: str) -> str:
        response = requests.post(
            self.ollama_url,
            json={"model": self.model, "prompt": prompt, "stream": False},
            timeout=120,
        )
        return response.json()["response"]

    # ─────────────────────────────────────────────────────────────────────────
    # Query rewriting
    # ─────────────────────────────────────────────────────────────────────────

    def rewrite_query(self, query: str, history: list[dict]) -> str:
        if not history:
            prompt = f"""Rewrite the question as a clear, concise, fully self-contained standalone question.

- Preserve the original intent.
- Do not add or assume any extra context.

Question:
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
        
        else:
        
            print("🔄 Rewriting follow-up query …")
            history_text = ""
            for msg in history[-3:]:
                role = "User" if msg["role"] == "user" else "Assistant"
                history_text += f"{role}: {msg['content']}\n"

            prompt = f"""Rewrite the follow-up question as a clear, concise, fully self-contained standalone question.

- Use only relevant context from the conversation history.
- Preserve the original intent.
- Do not include unnecessary details or make assumptions.

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
    # Main entry point
    # Returns a structured dict so the backend can forward sources to the UI.
    # ─────────────────────────────────────────────────────────────────────────

    def ask(
        self,
        query:           str,
        history:         list[dict] = None,
        user_role:      str = "client",
        case_section:    str = None,
        case_outcome:    str = None,
        case_chunk_type: str = None,
    ) -> dict:
        """
        Returns:
        {
            "answer":       str,
            "law_sources":  [ { type, section_number, section_title, chapter }, ... ],
            "case_sources": [ { type, citation, court, outcome, sections },     ... ]
        }
        """
        # 1. Rewrite if follow-up
        retrieval_query = (
            self.rewrite_query(query, history) # if history else query #commented out so rewriting happens on every query, not just follow-ups. This is because even standalone queries can be vague and benefit from expansion based on the model's understanding of relevant context from the history.
        )

        # 2. Retrieve from both DBs
        print(f"\n🔍 Retrieving laws for: \"{retrieval_query[:80]}\"")
        law_docs, law_metas = self.retrieve_laws(retrieval_query)
        print(f"   ✓ {len(law_docs)} law section(s) retrieved.")
        for m in law_metas:
            print(f"     • Section {m.get('section_number','?')} – {m.get('section_title','')}")

        print(f"\n⚖️  Retrieving cases for: \"{retrieval_query[:80]}\"")
        case_docs, case_metas = self.retrieve_cases(
            retrieval_query,
            chunk_type=case_chunk_type,
            section=case_section,
            outcome=case_outcome,
        )
        print(f"   ✓ {len(case_docs)} case chunk(s) retrieved.")
        for m in case_metas:
            print(f"     • {m.get('citation','?')} | {m.get('court','?')} | {m.get('outcome','?')} [{m.get('chunk_type','?')}]")

        # 3. Build prompt and generate answer
        print("\n💬 Generating answer …")
        prompt = self.build_prompt(
            query      = retrieval_query,
            law_docs   = law_docs,
            case_docs  = case_docs,
            law_metas  = law_metas,
            case_metas = case_metas,
            history    = history,
            user_role = "client"
        )
        answer = self.generate(prompt)

        # 4. Deduplicate and structure sources for the frontend
        # ── Law sources ───────────────────────────────────────────────────────
        seen_sections = set()
        law_sources   = []
        for m in law_metas:
            sec = m.get("section_number", "")
            if sec and sec not in seen_sections:
                seen_sections.add(sec)
                law_sources.append({
                    "type":           "law",
                    "section_number": sec,
                    "section_title":  m.get("section_title", ""),
                    "chapter":        m.get("chapter", ""),
                })

        # ── Case sources (one entry per unique citation) ───────────────────────
        seen_citations = set()
        case_sources   = []
        for m in case_metas:
            citation = m.get("citation", "")
            if citation and citation not in seen_citations:
                seen_citations.add(citation)
                case_sources.append({
                    "type":     "case",
                    "citation": citation,
                    "court":    m.get("court", ""),
                    "outcome":  m.get("outcome", ""),
                    "sections": m.get("primary_sections", ""),
                })

        return {
            "answer":       answer,
            "law_sources":  law_sources,
            "case_sources": case_sources,
        }


# ─────────────────────────────────────────────────────────────────────────────
# Quick interactive demo
# ─────────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    rag     = LocalRAG()
    history = []

    print("Pakistan Legal Assistant (type 'quit' to exit)\n")
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

        result = rag.ask(query, history=history if history else None, user_role="client")

        print(f"\n🤖 Assistant:\n{result['answer']}")
        print(f"\n📖 Law refs : {[s['section_number'] for s in result['law_sources']]}")
        print(f"⚖️  Case refs: {[s['citation'] for s in result['case_sources']]}")
        print("─" * 60)

        history.append({"role": "user",      "content": query})
        history.append({"role": "assistant", "content": result["answer"]})