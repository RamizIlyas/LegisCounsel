## To Run Rag Service :
uvicorn app:app --reload --port 8001
# LegisCounsel

LegisCounsel is a project designed to assist with legal document analysis and legislative research. It provides tools and resources to help users navigate complex legal texts, understand legislative frameworks, and access counsel-related information efficiently.

## Overview

This project aims to simplify the process of interpreting legal documents and provide accessible guidance on legislative matters through automated analysis and structured information retrieval.

## Features

- Legislative document parsing and analysis
- Legal text interpretation assistance
- Research and reference tools
- Document organization and management

## Getting Started

To get started with LegisCounsel, clone the repository and refer to the documentation for setup instructions and usage guidelines.

## License

See LICENSE file for details.

# to add in .env
MONGO_URI=mongodb://localhost:27017/
MONGO_DB=LegisCounsel
LAW_CHROMA_PATH=./law_vector_db    # for law_extraction_service.py
CHROMA_PATH=./cases_vector_db       # for case_extraction_service.py
PYTHON_SERVICE_URL=http://localhost:8001   # in your Node .env
EMAIL_USER= legis.counsell@gmail.com #email required to send reset password 
EMAIL_PASS=xxxx xxxx xxxx xxxx 

## Dependencies
npm install nodemailer #in backend for forgot mail