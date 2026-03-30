import chromadb
from chromadb.utils import embedding_functions
import requests
from sentence_transformers import util #, SentenceTransformer 

###Old Scoring Method using Sentence Transformers 
# - Not used as it is not strict and can give high scores to partially correct answers

# scoring_model = SentenceTransformer("all-MiniLM-L6-v2")
# Simple cosine similarity scoring function to SCore Model Output against Ground Truth
# def score_answer(predicted, ground_truth):
#     emb1 = scoring_model.encode(predicted, convert_to_tensor=True)
#     emb2 = scoring_model.encode(ground_truth, convert_to_tensor=True)
#     similarity = util.cos_sim(emb1, emb2).item()
#     return round(similarity * 100, 2)


# Use SAME embedding function as your DB
embedding_function = embedding_functions.SentenceTransformerEmbeddingFunction(
    model_name="BAAI/bge-base-en-v1.5",
    normalize_embeddings=True
)


class LocalRAG:
    # Initialize ChromaDB client and set up collection
    def __init__(self):
        print("🚀 Initializing RAG pipeline...")

        self.chroma_client = chromadb.PersistentClient(path="./law_vector_db")

        self.collection = self.chroma_client.get_collection(
            name="pakistan_penal_code",
            embedding_function=embedding_function
        )

        # Ollama endpoint
        self.ollama_url = "http://localhost:11434/api/generate"
        self.model = "mistral"   # llama3 or mistral(Fast)
        self.judge_model = "llama3"  # For evaluation (Llama 3 is better at scoring as it is strict)

        # Warm up the model with a dummy request to reduce latency on first real query
        print("🔥 Warming up model...")
        requests.post(
            self.ollama_url,
            json={
                "model": self.model,
                "prompt": "Hello",
                "stream": False
            }
        )

    # Retrieve relevant documents from ChromaDB based on query
    def retrieve(self, query, k=3):
        results = self.collection.query(
            query_texts=[query],
            n_results=k
        )
        return results["documents"][0], results["metadatas"][0]
    
    # Build prompt for LLM generation using retrieved documents and query
    def build_prompt(self, query, docs):
        context = "\n\n".join(docs)

        # #To add to strictness, we can instruct the model to only answer based on the context 
        # and penalize if it uses outside knowledge. 
        # Quote exact lines where possible.
        # If answer is not clearly present, say "Not found in context".
        # DO NOT use outside knowledge.

        prompt = f"""You are a legal assistant for Pakistan Penal Code.

                    Use ONLY the context below to answer the question.

                    Context:
                    {context}

                    Question:
                    {query}

                    Answer clearly with section references AND short explanation.
                    """
        return prompt

    # Generate answer using Mistral(Model is Mistral, Judge is Llama 3) LLM based on the built prompt
    def generate(self, prompt):
        response = requests.post(
            self.ollama_url,
            json={
                "model": self.model,
                "prompt": prompt,
                "stream": False
            }
        )

        return response.json()["response"]
    
    # Judge the generated answer against the ground truth using LLM
    # , providing a score and feedback based on strict criteria

    def judge_answer(self, question, answer, context, ground_truth):
        judge_prompt = f"""You are a STRICT legal evaluator.

        Evaluate ONLY using the context.

        Question:
        {question}

        Context:
        {context}

        Model Answer:
        {answer}

        Expected Answer:
        {ground_truth}

        Rules:
        - Penalize hallucinations
        - Penalize missing details
        - Be strict

        Output EXACTLY in this format (no % sign):

        Score: <number>
        Faithful: <Yes/No>
        Correct: <Yes/Partial/No>
        Reason: <short>
        """
        response = requests.post(
            self.ollama_url,
            json={
                "model": self.judge_model,
                "prompt": judge_prompt,
                "stream": False
            }
        )

        return response.json()["response"]
    
    # Verify if the generated answer is fully supported by the retrieved context using LLM
    def verify_answer(self, answer, context):
        prompt = f"""Check if the answer is fully supported by the context.

        Answer:
        {answer}

        Context:
        {context}

        Reply ONLY:
        Supported: Yes/No
        """

        response = requests.post(
            self.ollama_url,
            json={
                "model": self.judge_model,
                "prompt": prompt,
                "stream": False
            }
        )

        return response.json()["response"]
    
    # Main method to ask a question, retrieve context, generate answer, and print results
    def ask(self, query, docs=None, metas=None):
        if docs is None:
            docs, metas = self.retrieve(query)

        print("\n📚 Retrieved Context:")
        for m in metas[:3]:
            print(f"   Section {m['section_number']} - {m['section_title']}")

        prompt = self.build_prompt(query, docs)
        answer = self.generate(prompt)

        return answer