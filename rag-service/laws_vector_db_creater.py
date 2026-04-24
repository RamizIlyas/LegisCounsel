# laws_vector_db_creater.py
import chromadb
from pymongo import MongoClient
import uuid
import time
from chromadb.utils import embedding_functions

print("🔄 Loading embedding model ONCE...")
embedding_function_global = embedding_functions.SentenceTransformerEmbeddingFunction(
    model_name="BAAI/bge-base-en-v1.5",
    normalize_embeddings=True
)
print("✅ Model loaded once!")


class LocalLawVectorDB:
    def __init__(self, mongodb_uri="mongodb://localhost:27017/", db_name="LegisCounsel"):
        print("🚀 Initializing Local Vector Database...")
        start_time = time.time()

        self.client = MongoClient(mongodb_uri)
        self.db = self.client[db_name]
        self.laws_collection = self.db["laws"]  # ✅ updated collection

        # Chroma
        self.chroma_client = chromadb.PersistentClient(path="./law_vector_db")

        embedding_function = embedding_function_global

        # Reset collection
        try:
            self.chroma_client.delete_collection("laws_vector_db")
            print("✅ Cleared existing collection")
        except:
            pass

        self.collection = self.chroma_client.get_or_create_collection(
            name="laws_vector_db",
            embedding_function=embedding_function
        )

        print(f"✅ Initialization completed in {time.time() - start_time:.2f} seconds")

    # 🔥 NEW DOCUMENT PREP (UPDATED SCHEMA)
    def prepare_documents(self):
        print("📚 Preparing documents from MongoDB...")

        documents = []
        metadatas = []
        ids = []

        laws = self.laws_collection.find({})

        for law in laws:
            law_title = law.get("file_stem", "").strip()
            content = law.get("body_text") or law.get("full_text", "")
            content = content.strip()

            if not content:
                continue

            doc_type = law.get("doc_type", "")
            category = law.get("document_category", "")
            act_number = law.get("act_number", "")
            defined_terms = law.get("defined_terms", [])

            # 🔥 chunking full law text
            chunks = self.chunk_text(content)

            for idx, chunk in enumerate(chunks):
                documents.append(f"{law_title}: {chunk}")

                metadatas.append({
                    "law_title": law_title,
                    "chunk_id": idx,
                    "doc_type": doc_type,
                    "category": category,
                    "act_number": act_number,
                    "source": "LegisCounsel"
                })

                ids.append(f"{law_title[:30]}_{idx}_{uuid.uuid4().hex[:6]}")

            # 🔥 OPTIONAL: add defined terms as separate entries (VERY useful for RAG)
            for term in defined_terms:
                term_name = term.get("term", "")
                definition = term.get("definition", "")

                if term_name and definition:
                    documents.append(f"{law_title} - Definition of {term_name}: {definition}")

                    metadatas.append({
                        "law_title": law_title,
                        "type": "definition",
                        "term": term_name,
                        "source": "LegisCounsel"
                    })

                    ids.append(f"def_{term_name}_{uuid.uuid4().hex[:6]}")

        print(f"✅ Prepared {len(documents)} chunks")
        return documents, metadatas, ids

    def chunk_text(self, text, chunk_size=300, overlap=50):
        words = text.split()
        chunks = []

        for i in range(0, len(words), chunk_size - overlap):
            chunk = " ".join(words[i:i + chunk_size])
            chunks.append(chunk)

        return chunks

    def create_vector_database_fast(self):
        print("🔄 Creating vector database...")
        total_start = time.time()

        documents, metadatas, ids = self.prepare_documents()

        if not documents:
            print("❌ No documents to process!")
            return

        batch_size = 100

        for i in range(0, len(documents), batch_size):
            batch_start = time.time()

            end_idx = min(i + batch_size, len(documents))

            self.collection.add(
                documents=documents[i:end_idx],
                metadatas=metadatas[i:end_idx],
                ids=ids[i:end_idx]
            )

            print(f"✅ Batch {i//batch_size + 1} added ({end_idx - i} docs, {time.time() - batch_start:.2f}s)")

        print(f"\n🎉 Database created in {time.time() - total_start:.2f} seconds!")
        print(f"📊 Total documents: {self.collection.count()}")


def test_local_rag():
    print("🧪 Testing Local RAG System...")

    vector_db = LocalLawVectorDB()
    vector_db.create_vector_database_fast()

    test_queries = [
        "punishment for adultery",
        "tribunal powers",
        "bail law Pakistan",
        "scheduled offence meaning"
    ]

    for query in test_queries:
        print(f"\n🔍 Searching: '{query}'")

        try:
            results = vector_db.collection.query(
                query_texts=[query],
                n_results=10
            )

            for i, (doc, metadata) in enumerate(zip(results['documents'][0], results['metadatas'][0])):
                print(f"   {i+1}. {metadata.get('law_title', '')}")
                print(f"      Preview: {doc[:120]}...")

        except Exception as e:
            print(f"   ❌ Search failed: {e}")


if __name__ == "__main__":
    test_local_rag()