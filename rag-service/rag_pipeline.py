# rag_pipeline.py
# RAG Pipeline for Pakistan Legal Assistant
# Retrieves relevant law sections from the Penal Code vector DB
# AND relevant case judgements from the cases vector DB,
# then combines both into a single grounded LLM prompt.

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
        laws_k:        int = 3,   # law sections to retrieve
        cases_k:       int = 3,   # case judgements to retrieve
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
        """Retrieve relevant PPC sections from the laws vector DB."""
        res = self.laws_collection.query(
            query_texts=[query],
            n_results=self.laws_k,
        )
        return res["documents"][0], res["metadatas"][0]

    def retrieve_cases(
        self,
        query:      str,
        chunk_type: str = None,   # "summary" | "headnote" | "judgment" | None
        section:    str = None,   # e.g. "302" to filter by primary_sections
        outcome:    str = None,   # e.g. "Acquitted"
    ) -> tuple[list[str], list[dict]]:
        """
        Retrieve relevant judgement chunks from the cases vector DB.
        Prefer summary + headnote chunks for concise case overviews;
        fall back to all chunk types if filtered results are insufficient.
        """
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
            res = self.cases_collection.query(**kwargs)
            docs  = res["documents"][0]
            metas = res["metadatas"][0]
            # If filters returned nothing, retry without filters
            if not docs and where:
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
    ) -> str:
        # ── Conversation history (last 3 turns) ───────────────────────────────
        history_text = ""
        if history:
            for msg in history[-3:]:
                role = "User" if msg["role"] == "user" else "Assistant"
                history_text += f"{role}: {msg['content']}\n"

        # ── Laws context block ─────────────────────────────────────────────────
        law_blocks = []
        for doc, meta in zip(law_docs, law_metas):
            sec   = meta.get("section_number", "?")
            title = meta.get("section_title", "")
            law_blocks.append(f"[Section {sec} – {title}]\n{doc}")
        laws_context = "\n\n".join(law_blocks) if law_blocks else "No relevant law sections found."

        # ── Cases context block ────────────────────────────────────────────────
        case_blocks = []
        for doc, meta in zip(case_docs, case_metas):
            citation = meta.get("citation", "Unknown")
            court    = meta.get("court", "")
            outcome  = meta.get("outcome", "")
            ctype    = meta.get("chunk_type", "")
            header   = f"[{citation} | {court} | Outcome: {outcome} | {ctype}]"
            case_blocks.append(f"{header}\n{doc}")
        cases_context = "\n\n".join(case_blocks) if case_blocks else "No relevant cases found."

        prompt = f"""You are an expert legal assistant specialising in Pakistani law.

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
- Explain in clear, simple language what the law says and how the courts have interpreted it.
- If the cases show conflicting outcomes, mention both and explain the distinction.
- Keep your answer structured: Law → Case precedent → Plain-language conclusion.

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
        # print("\nDEBUG RESPONSE:")
        # print(response.json())
        return response.json()["response"]

    # ─────────────────────────────────────────────────────────────────────────
    # Query rewriting for follow-up questions
    # ─────────────────────────────────────────────────────────────────────────

    def rewrite_query(self, query: str, history: list[dict]) -> str:
        """Rewrite a follow-up question to be fully self-contained."""
        if not history:
            return query

        print("🔄 Rewriting follow-up query …")
        history_text = ""
        for msg in history[-3:]:
            role = "User" if msg["role"] == "user" else "Assistant"
            history_text += f"{role}: {msg['content']}\n"

        prompt = f"""Rewrite the user's follow-up question as a fully self-contained question.
Only include context from the conversation that is directly relevant.

Conversation:
{history_text}

Follow-up Question:
{query}

Rewritten standalone question:"""

        response = requests.post(
            self.ollama_url,
            json={"model": self.model, "prompt": prompt, "stream": False},
            timeout=60,
        )
        rewritten = response.json()["response"].strip()
        print(f"   → {rewritten}")
        return rewritten

    # ─────────────────────────────────────────────────────────────────────────
    # Main entry point
    # ─────────────────────────────────────────────────────────────────────────

    def ask(
        self,
        query:        str,
        history:      list[dict] = None,
        # Optional case filters — pass these for more targeted case retrieval
        case_section: str = None,   # e.g. "302"
        case_outcome: str = None,   # e.g. "Acquitted"
        case_chunk_type: str = None,  # "summary" | "headnote" | "judgment"
    ) -> str:
        # ── 1. Rewrite query if this is a follow-up ───────────────────────────
        retrieval_query = (
            self.rewrite_query(query, history) if history else query
        )

        # ── 2. Retrieve from BOTH vector DBs ──────────────────────────────────
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

        # ── 3. Build prompt & generate answer ─────────────────────────────────
        print("\n💬 Generating answer …")
        prompt = self.build_prompt(
            query       = retrieval_query,
            law_docs    = law_docs,
            case_docs   = case_docs,
            law_metas   = law_metas,
            case_metas  = case_metas,
            history     = history,
        )
        answer = self.generate(prompt)
        return answer


# ─────────────────────────────────────────────────────────────────────────────
# Quick interactive demo
# ─────────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    rag = LocalRAG()
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

        answer = rag.ask(query, history=history if history else None)

        print(f"\n🤖 Assistant:\n{answer}")
        print("─" * 60)

        # Update conversation history
        history.append({"role": "user",      "content": query})
        history.append({"role": "assistant", "content": answer})