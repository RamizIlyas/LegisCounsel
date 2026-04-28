"""
Chroma Vector DB → JSON Exporter
================================
Exports all records from the persistent ChromaDB collection
'laws_vector_db' into a structured JSON file.

Safe for large datasets.
Does NOT modify the database.

Output:
    laws_vector_db_export.json
"""

import chromadb
import json
import time
from chromadb.utils import embedding_functions


print("🔄 Loading embedding model ONCE...")

embedding_function_global = (
    embedding_functions.SentenceTransformerEmbeddingFunction(
        model_name="BAAI/bge-base-en-v1.5",
        normalize_embeddings=True
    )
)

print("✅ Model loaded!")


class VectorDBToJSONConverter:

    def __init__(
        self,
        db_path="./law_vector_db",
        collection_name="laws_vector_db",
        output_file="laws_vector_db_export.json"
    ):

        print("\n🚀 Initializing converter...")
        start_time = time.time()

        self.output_file = output_file

        self.chroma_client = chromadb.PersistentClient(
            path=db_path
        )

        self.collection = self.chroma_client.get_or_create_collection(
            name=collection_name
            # ,embedding_function=embedding_function_global
        )

        print(
            f"✅ Connected to collection: {collection_name}"
        )

        print(
            f"📊 Total records in DB: {self.collection.count()}"
        )

        print(
            f"⏱ Initialization time: {time.time() - start_time:.2f}s"
        )

    # -----------------------------------------------------

    def export(self, batch_size=500):

        print("\n📥 Fetching records from vector database...")

        total_records = self.collection.count()

        if total_records == 0:
            print("❌ No records found in collection.")
            return

        all_records = []

        start_time = time.time()

        for offset in range(0, total_records, batch_size):

            batch_start = time.time()

            results = self.collection.get(
                include=["documents", "metadatas"],
                limit=batch_size,
                offset=offset
            )

            documents = results.get("documents", [])
            metadatas = results.get("metadatas", [])
            ids = results.get("ids", [])

            for i in range(len(ids)):

                record = {
                    "id": ids[i],
                    "document": documents[i],
                    "metadata": metadatas[i]
                }

                all_records.append(record)

            print(
                f"✅ Batch {(offset // batch_size) + 1} exported "
                f"({len(ids)} records, "
                f"{time.time() - batch_start:.2f}s)"
            )

        print("\n💾 Writing JSON file...")

        with open(self.output_file, "w", encoding="utf-8") as f:

            json.dump(
                all_records,
                f,
                indent=2,
                ensure_ascii=False
            )

        print(
            f"\n🎉 Export completed successfully!"
        )

        print(
            f"📁 File saved as: {self.output_file}"
        )

        print(
            f"📊 Total exported records: {len(all_records)}"
        )

        print(
            f"⏱ Total time: {time.time() - start_time:.2f}s"
        )


# -----------------------------------------------------

if __name__ == "__main__":

    converter = VectorDBToJSONConverter()

    converter.export()