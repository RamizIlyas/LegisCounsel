from fastapi import FastAPI
from pydantic import BaseModel
from rag_pipeline import LocalRAG

app = FastAPI()
rag = LocalRAG()

class Query(BaseModel):
    question: str

@app.post("/ask")
def ask(query: Query):
    docs, metas = rag.retrieve(query.question)
    answer = rag.ask(query.question, docs, metas)

    return {
        "answer": answer,
        "sources": metas
    }