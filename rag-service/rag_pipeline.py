# from urllib import response
import chromadb
from chromadb.utils import embedding_functions
import requests
# from sentence_transformers import util #, SentenceTransformer 

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
        self.model = "llama3.2:3b"   # llama3 or mistral(Fast)
        self.judge_model = "llama3.2:3b"  # For evaluation (Llama 3 is better at scoring as it is strict)

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
    def build_prompt(self, query, docs, history=None, metas=None):
        context = "\n\n".join(docs)
        # Include conversation history in the prompt 
        # to provide context for follow-up questions, 
        # but limit to last 5 messages to avoid overwhelming the model.
        # Clearly label user and assistant messages.
        history_text = ""
        if history:
            for msg in history[-3:]:  # last 3 messages only
                role = "User" if msg["role"] == "user" else "Assistant"
                history_text += f"{role}: {msg['content']}\n"
        # #To add to strictness, we can instruct the model to only answer based on the context 
        # and penalize if it uses outside knowledge. 
        # Quote exact lines where possible.
        # If answer is not clearly present, say "Not found in context".
        # DO NOT use outside knowledge.

        prompt = f"""You are a legal assistant for Pakistan Penal Code.

                    Use ONLY the context below and Conversation History (More Important) to answer the question.
                    If the answer is not clearly in the context, say "Not found in provided context."
                    Do NOT guess or introduce unrelated sections.
                    
                    Conversation History:
                    {history_text}

                    Context:
                    {context}

                    Question:
                    {query}

                    Answer clearly with section references AND detailed explanation in simple words.
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
    
    ## Judge the generated answer against the ground truth using LLM
    ## , providing a score and feedback based on strict criteria

    # def judge_answer(self, question, answer, context, ground_truth):
    #     judge_prompt = f"""You are a STRICT legal evaluator.

    #     Evaluate ONLY using the context.

    #     Question:
    #     {question}

    #     Context:
    #     {context}

    #     Model Answer:
    #     {answer}

    #     Expected Answer:
    #     {ground_truth}

    #     Rules:
    #     - Penalize hallucinations
    #     - Penalize missing details
    #     - Be strict

    #     Output EXACTLY in this format (no % sign):

    #     Score: <number>
    #     Faithful: <Yes/No>
    #     Correct: <Yes/Partial/No>
    #     Reason: <short>
    #     """
    #     response = requests.post(
    #         self.ollama_url,
    #         json={
    #             "model": self.judge_model,
    #             "prompt": judge_prompt,
    #             "stream": False
    #         }
    #     )

    #     return response.json()["response"]
    
    ## Verify if the generated answer is fully supported by the retrieved context using LLM
    # def verify_answer(self, answer, context):
    #     prompt = f"""Check if the answer is fully supported by the context.

    #     Answer:
    #     {answer}

    #     Context:
    #     {context}

    #     Reply ONLY:
    #     Supported: Yes/No
    #     """

    #     response = requests.post(
    #         self.ollama_url,
    #         json={
    #             "model": self.judge_model,
    #             "prompt": prompt,
    #             "stream": False
    #         }
    #     )

    #     return response.json()["response"]
    
    ## Rewrite follow-up questions to be self-contained using LLM, 
    ## incorporating relevant conversation history to provide necessary context for accurate retrieval and answer generation.
    def rewrite_query(self, query, history):
        if not history:
            return query
        print("\n🔄 Rewriting query to be self-contained using conversation history...")
        history_text = ""
        for msg in history[-3:]:  # last 3 messages
            role = "User" if msg["role"] == "user" else "Assistant"
            history_text += f"{role}: {msg['content']}\n"

        prompt = f"""Rewrite the user's question to be fully self-contained.
                you dont alwasys have to use the entire conversation history, only use relevant parts.

                Conversation:
                {history_text}

                Follow-up Question:
                {query}

                Rewritten standalone question:
                """

        response = requests.post(
            self.ollama_url,
            json={
                "model": self.judge_model,  # use llama3 (better reasoning)
                "prompt": prompt,
                "stream": False
            }
        )

        return response.json()["response"].strip()


    # Main method to ask a question, retrieve context, generate answer, and print results
    def ask(self, query, docs=None, metas=None, history=None):
        # if docs is None:
        #     docs, metas = self.retrieve(query)
        
        ## Rewrite query to be self-contained 
        ## if there is conversation history,
        if not history:
            rewritten_query = query
        else:
            rewritten_query = self.rewrite_query(query, history)
            print(f"\n🔄 Rewritten Query:\n{rewritten_query}")
            

        docs, metas = self.retrieve(rewritten_query)


        # Print retrieved context for debugging and transparency
        print("\n📚 Retrieved Context:")
        for m in metas[:3]:
            print(f"   Section {m['section_number']} - {m['section_title']}")

        prompt = self.build_prompt(rewritten_query, docs, history,metas)
        answer = self.generate(prompt)

        return answer
        
        



        ## If docs are already provided (from a previous retrieval),
        ## it uses them directly. 
        ## This allows for more efficient follow-up questions 
        ## without needing to retrieve again.
