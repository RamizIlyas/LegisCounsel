## Installation required to run law exracter
pip install pymongo pdfminer.six PyPDF2 tqdm    
 
## LAw Extractor run command
python law_cases_extractor.py --zip "Law_Cases_Judgements.zip" --mongo "mongodb://localhost:27017/" --db pakistan_law_db

## Installations required for chromadb
pip install pymongo chromadb sentence-transformers tqdm 

## To run without building VectorDB AGain and again
python cases_vector_db.py --skip-build --demo