"""
Law Cases / Judgements — ZIP to MongoDB Extractor
==================================================
Extracts all PDFs from a ZIP archive of Pakistani court judgements,
parses rich metadata from each case, and stores everything in MongoDB.

Requirements:
    pip install pymongo pdfminer.six PyPDF2 tqdm

Usage:
    python law_cases_extractor.py --zip path/to/cases.zip --mongo mongodb://localhost:27017/ --db pakistan_law_db

Author : Generated for Pakistan Law Cases project
"""

import argparse
import io
import os
import re
import sys
import zipfile
from datetime import datetime
from pathlib import Path

# ── Third-party ──────────────────────────────────────────────────────────────
try:
    from pymongo import MongoClient, ASCENDING, TEXT
    from pymongo.errors import BulkWriteError
except ImportError:
    sys.exit("pymongo not found.  Run: pip install pymongo")

try:
    import pdfminer.high_level as pdfminer_hl
    import pdfminer.layout as pdfminer_layout
    from pdfminer.high_level import extract_text_to_fp
    from pdfminer.layout import LAParams
except ImportError:
    sys.exit("pdfminer.six not found.  Run: pip install pdfminer.six")

try:
    from tqdm import tqdm
    TQDM_AVAILABLE = True
except ImportError:
    TQDM_AVAILABLE = False


# ═══════════════════════════════════════════════════════════════════════════════
#  SECTION 1 ─ PDF Text Extraction
# ═══════════════════════════════════════════════════════════════════════════════

def extract_text_from_bytes(pdf_bytes: bytes) -> str:
    """
    Extract plain text from PDF bytes using pdfminer (primary) with
    a PyPDF2 fallback for encrypted / unusual PDFs.
    """
    # Primary: pdfminer
    try:
        text = pdfminer_hl.extract_text(
            io.BytesIO(pdf_bytes),
            laparams=LAParams(line_margin=0.5, char_margin=2.0),
        )
        if text and len(text.strip()) > 100:
            return text
    except Exception:
        pass

    # Fallback: PyPDF2
    try:
        import PyPDF2
        reader = PyPDF2.PdfReader(io.BytesIO(pdf_bytes))
        pages = [page.extract_text() or "" for page in reader.pages]
        return "\n".join(pages)
    except Exception as exc:
        print(f"    [WARN] Both PDF extractors failed: {exc}")
        return ""


# ═══════════════════════════════════════════════════════════════════════════════
#  SECTION 2 ─ Filename Parsing
# ═══════════════════════════════════════════════════════════════════════════════

# Matches the trailing "(302 PPC)" / "(497 CrPC)" / "(154 156 CrPC)" token
_SECTION_RE = re.compile(
    r'\((?P<sections>[\d\w\-\s]+?)\s+(?P<law>PPC|CrPC|PPO|MCA|PA)\)',
    re.IGNORECASE,
)


def parse_filename(filename: str) -> dict:
    """
    Extract structured metadata from the PDF filename.

    Returns a dict with:
        original_filename, case_name_raw, legal_sections (list),
        law_code, file_stem
    """
    stem = Path(filename).stem          # strip .pdf
    stem_clean = stem.strip()

    # Extract the trailing "(sections LAW)" tag
    match = _SECTION_RE.search(stem_clean)
    legal_sections: list[str] = []
    law_code = "UNKNOWN"

    if match:
        raw_sections = match.group("sections").strip()
        law_code = match.group("law").upper()
        # Multiple section numbers can appear: "154 156"
        legal_sections = [s.strip() for s in raw_sections.split() if s.strip()]
        # Remove the section tag from the case name
        case_name_raw = stem_clean[: match.start()].strip(" _-")
    else:
        case_name_raw = stem_clean

    # Normalise separators in case name
    case_name_clean = re.sub(r'[_\-]+', ' ', case_name_raw).strip()
    case_name_clean = re.sub(r'\s{2,}', ' ', case_name_clean)

    return {
        "original_filename": filename,
        "file_stem": stem_clean,
        "case_name_raw": case_name_clean,
        "legal_sections": legal_sections,   # e.g. ["302"] or ["154","156"]
        "law_code": law_code,               # "PPC" | "CrPC" | …
    }


# ═══════════════════════════════════════════════════════════════════════════════
#  SECTION 3 ─ Content Parsing (regex-based NLP)
# ═══════════════════════════════════════════════════════════════════════════════

# ── small helper ─────────────────────────────────────────────────────────────
def _first_match(patterns: list[str], text: str,
                 flags=re.IGNORECASE | re.MULTILINE) -> str | None:
    for pat in patterns:
        m = re.search(pat, text, flags)
        if m:
            return m.group(1).strip()
    return None


def _clean(s: str | None) -> str:
    """Strip extra whitespace from a matched string."""
    if not s:
        return ""
    return re.sub(r'\s+', ' ', s).strip()


# ─────────────────────────────────────────────────────────────────────────────
def parse_citation(text: str) -> str:
    """
    Detect the primary citation printed at the top of the document.
    Handles: '2007 S C M R 108', '2022LHC436', 'PLD 2018 SC 100',
             'SBLR 2020 Sindh 122', 'Pcrlj 2023 1588', etc.
    """
    patterns = [
        # e.g. 2007 S C M R 108
        r'^\s*(\d{4}\s+S\s+C\s+M\s+R\s+\d+)',
        # e.g. PLD 2018 SC 100
        r'(PLD\s+\d{4}\s+\w+\s+\d+)',
        # e.g. 2022LHC436
        r'(\d{4}[A-Z]{2,5}\d+)',
        # e.g. SBLR 2020 Sindh 122
        r'(SBLR[-\s]\d{4}[-\s]\w+[-\s]\d+)',
        # e.g. 2023-Pcrlj-1588
        r'(\d{4}[-\s]?Pcrlj[-\s]?\d+)',
    ]
    # Check the first 500 characters where citation usually appears
    for pat in patterns:
        m = re.search(pat, text[:500], re.IGNORECASE | re.MULTILINE)
        if m:
            return _clean(m.group(1))
    return ""


def parse_court(text: str) -> str:
    patterns = [
        r'\[(Supreme Court of Pakistan)\]',
        r'\[(Lahore High Court.*?)\]',
        r'\[(High Court of .*?)\]',
        r'\[(Federal Shariat Court.*?)\]',
        r'IN\s+THE\s+((?:SUPREME|HIGH|SESSIONS|DISTRICT|FEDERAL\s+SHARIAT)\s+COURT[^,\n]{0,60})',
        r'(Supreme Court of Pakistan)',
        r'(Lahore High Court[^,\n]{0,40})',
        r'(High Court of [A-Z][^,\n]{0,40})',
    ]
    return _clean(_first_match(patterns, text[:1500]))


def parse_judges(text: str) -> list[str]:
    """
    Extract judge names listed in 'Present:' or 'CORAM:' lines.
    Returns a list of individual judge names.
    """
    m = re.search(
        r'(?:Present|CORAM)\s*:\s*([^\n]{10,200})',
        text[:2000], re.IGNORECASE
    )
    if not m:
        return []
    raw = m.group(1)
    # Remove suffixes like JJ, J., C.J.
    raw = re.sub(r'\b(?:JJ?\.?|C\.?J\.?)\b', '', raw, flags=re.IGNORECASE)
    # Split on 'and', commas, semicolons
    names = re.split(r'\s*(?:and|,|;)\s*', raw)
    return [_clean(n) for n in names if len(_clean(n)) > 3]


def parse_parties(text: str) -> tuple[str, str]:
    """
    Return (appellant/petitioner, respondent).
    Handles patterns like:
        MUHAMMAD ISHAQUE----Appellant
        THE STATE----Respondent
    or  'X versus Y' on one line.
    """
    header = text[:2500]

    # Pattern A: "NAME----Role" lines (most common in Pakistani judgements)
    appellant, respondent = "", ""

    # Appellant side
    m = re.search(
        r'\n([A-Z][A-Z\s\.\-\(\)]{3,70})[-─]{2,4}\s*'
        r'(?:Appellant|Petitioner|Applicant)',
        header
    )
    if m:
        # Strip any leading "JJ " or similar judge suffix leakage
        appellant = re.sub(r'^[A-Z]{1,3}\s+', '', m.group(1)).strip(' -─')
        appellant = _clean(appellant)

    # Respondent side
    m = re.search(
        r'\n([A-Z][A-Z\s\.\-\(\)]{3,70})[-─]{2,4}\s*'
        r'(?:Respondent|Respondents|The State)',
        header
    )
    if m:
        respondent = _clean(m.group(1).strip(' -─'))

    # Pattern B: "X versus / vs Y" on one line (fallback)
    if not appellant:
        m = re.search(
            r'([A-Z][A-Za-z\s\.\-]{3,60}?)\s+(?:versus|vs\.?)\s+([A-Z][^\n]{3,60})',
            header, re.IGNORECASE
        )
        if m:
            appellant = _clean(m.group(1))
            respondent = respondent or _clean(m.group(2))

    return appellant, respondent


def parse_case_numbers(text: str) -> list[str]:
    """
    Extract all case/appeal/petition numbers mentioned near the top.
    e.g. 'Criminal Appeal No.115 of 2004', 'Cr.A. 16-Q of 2006',
         'W.P. No. 1234/2022'
    """
    pattern = re.compile(
        r'(?:Criminal Appeal|Civil Appeal|W\.?P\.?|Cr\.?A\.?|Jail Petition|'
        r'Crl\.?\s*Revision|Sessions Case|Cr\.\s*Misc\.?|Constitution Petition)'
        r'\s*No[s]?\.\s*[\d\-\/A-Za-z]+(?:\s+of\s+\d{4})?',
        re.IGNORECASE,
    )
    return list(dict.fromkeys(                   # preserve order, deduplicate
        _clean(m.group()) for m in pattern.finditer(text[:3000])
    ))


def parse_decision_date(text: str) -> str:
    patterns = [
        r'decided\s+on\s+(\d{1,2}(?:st|nd|rd|th)?\s+\w+,?\s*\d{4})',
        r'(?:Date of (?:hearing|judgment|decision)|Order dated?)\s*[:\-]?\s*'
        r'(\d{1,2}[./\-]\d{1,2}[./\-]\d{2,4})',
        r'(?:Date of (?:hearing|judgment|decision)|Order dated?)\s*[:\-]?\s*'
        r'(\d{1,2}\s+\w+,?\s+\d{4})',
        r'(\d{1,2}(?:st|nd|rd|th)?\s+\w+,?\s+\d{4})',  # last resort
    ]
    return _clean(_first_match(patterns, text[:3000]))


def parse_headnotes(text: str) -> list[str]:
    """
    Extract the headnote bullet-points that summarise the legal issues.
    These appear before 'JUDGMENT' and usually start with '----'.
    """
    # Find the block between the party block and JUDGMENT
    judgment_pos = re.search(r'\bJUDGMENT\b', text, re.IGNORECASE)
    header_text = text[: judgment_pos.start()] if judgment_pos else text[:4000]

    # Extract dash-prefixed headnote lines
    raw = re.findall(r'[-─]{3,}\s*(.+?)(?=\n[-─]{3,}|\n\n|\Z)', header_text, re.DOTALL)
    cleaned = [_clean(r) for r in raw if len(_clean(r)) > 20]
    return cleaned[:15]   # cap at 15 headnotes


def parse_sections_mentioned(text: str) -> list[str]:
    """
    Collect all PPC / CrPC / other code sections explicitly cited in the text.
    e.g. "section 302, P.P.C." → "302 PPC"
    Only matches known law codes to avoid garbage.
    """
    pattern = re.compile(
        r'[Ss](?:ections?|s\.?)?\s*([\d]+[A-Z\-]*(?:/[\d]+)?)'
        r'\s*(?:,\s*|\s+)(?P<law>P\.?P\.?C\.?|Cr\.?P\.?C\.?|M\.?C\.?A\.?)',
        re.IGNORECASE,
    )
    found = set()
    for m in pattern.finditer(text):
        num = m.group(1).strip().rstrip('.,')
        raw_law = m.group('law').replace('.', '').upper()
        if raw_law.startswith('PP'):
            law = 'PPC'
        elif raw_law.startswith('CR'):
            law = 'CrPC'
        elif raw_law.startswith('MC'):
            law = 'MCA'
        else:
            law = raw_law
        # Sanity-check: section numbers should be 1-4 digits
        if re.match(r'^\d{1,4}[A-Z\-]*$', num):
            found.add(f"{num} {law}")
    return sorted(found)


def parse_outcome(text: str) -> str:
    """
    Detect the final outcome: Acquitted / Convicted / Appeal Allowed /
    Appeal Dismissed / Bail Granted / Bail Refused / etc.
    """
    # Look near the end of the document for outcome signals
    tail = text[-3000:]
    rules = [
        (r'\bacquitted?\b', "Acquitted"),
        (r'\bappeal\s+(?:is\s+)?allowed\b', "Appeal Allowed"),
        (r'\bappeal\s+(?:is\s+)?dismissed\b', "Appeal Dismissed"),
        (r'\bpetition\s+(?:is\s+)?allowed\b', "Petition Allowed"),
        (r'\bpetition\s+(?:is\s+)?dismissed\b', "Petition Dismissed"),
        (r'\bbail\s+(?:is\s+)?(?:hereby\s+)?granted\b', "Bail Granted"),
        (r'\bbail\s+(?:is\s+)?(?:hereby\s+)?(?:refused|rejected)\b', "Bail Refused"),
        (r'\bconvicted?\b', "Convicted"),
        (r'\bsentenced?\b', "Sentenced"),
    ]
    for pattern, label in rules:
        if re.search(pattern, tail, re.IGNORECASE):
            return label
    return "Unknown"


def parse_advocates(text: str) -> dict:
    """
    Extract advocate names for appellant and respondent sides.
    Returns {"appellant_counsel": [...], "respondent_counsel": [...]}
    """
    result = {"appellant_counsel": [], "respondent_counsel": []}

    # Pattern: "Name, Advocate [Supreme Court] for Appellant"
    for m in re.finditer(
        r'([A-Z][A-Za-z\s\.\-]{5,60}),\s*Advocate(?:[^\n]{0,50}?)for\s+'
        r'(Appellant|Petitioner|Applicant|Respondent|State|complainant)',
        text[:3500], re.IGNORECASE
    ):
        name = _clean(m.group(1))
        role = m.group(2).lower()
        if any(r in role for r in ('appellant', 'petitioner', 'applicant')):
            result["appellant_counsel"].append(name)
        else:
            result["respondent_counsel"].append(name)

    # Deduplicate
    result["appellant_counsel"] = list(dict.fromkeys(result["appellant_counsel"]))
    result["respondent_counsel"] = list(dict.fromkeys(result["respondent_counsel"]))
    return result


def parse_judgment_body(text: str) -> str:
    """
    Extract just the judgment body text (after the 'JUDGMENT' header).
    """
    m = re.search(r'\bJUDGMENT\b', text, re.IGNORECASE)
    if m:
        return text[m.start():].strip()
    return text.strip()


# ── Master parser ─────────────────────────────────────────────────────────────
def parse_case_document(text: str, filename_meta: dict) -> dict:
    """
    Combine filename metadata and content-parsed fields into one document.
    """
    citation   = parse_citation(text)
    court      = parse_court(text)
    judges     = parse_judges(text)
    appellant, respondent = parse_parties(text)
    case_nos   = parse_case_numbers(text)
    date_str   = parse_decision_date(text)
    headnotes  = parse_headnotes(text)
    sections   = parse_sections_mentioned(text)
    outcome    = parse_outcome(text)
    advocates  = parse_advocates(text)
    judgment   = parse_judgment_body(text)

    # Merge sections from filename with those found in text
    all_sections = list(dict.fromkeys(
        [f"{s} {filename_meta['law_code']}" for s in filename_meta["legal_sections"]]
        + sections
    ))

    return {
        # ── Identity ──────────────────────────────────────────────
        "citation":          citation or filename_meta["file_stem"],
        "case_name":         filename_meta["case_name_raw"],
        "original_filename": filename_meta["original_filename"],

        # ── Parties ───────────────────────────────────────────────
        "appellant":         appellant,
        "respondent":        respondent,

        # ── Court & Bench ─────────────────────────────────────────
        "court":             court,
        "judges":            judges,

        # ── Classification ────────────────────────────────────────
        "law_code":          filename_meta["law_code"],    # PPC / CrPC / …
        "primary_sections":  filename_meta["legal_sections"],  # from filename
        "all_sections_cited": all_sections,                # from full text

        # ── Procedural ────────────────────────────────────────────
        "case_numbers":      case_nos,
        "decision_date":     date_str,
        "outcome":           outcome,

        # ── Legal Content ─────────────────────────────────────────
        "headnotes":         headnotes,
        "advocates":         advocates,
        "judgment_text":     judgment,
        "full_text":         text,

        # ── Housekeeping ──────────────────────────────────────────
        "word_count":        len(text.split()),
        "page_count_estimate": max(1, len(text) // 3000),
        "document_type":     "court_judgement",
        "created_at":        datetime.utcnow(),
        "updated_at":        datetime.utcnow(),
    }


# ═══════════════════════════════════════════════════════════════════════════════
#  SECTION 4 ─ MongoDB Storage
# ═══════════════════════════════════════════════════════════════════════════════

class LawCasesDB:
    def __init__(self, mongo_uri: str, db_name: str):
        self.client = MongoClient(mongo_uri, serverSelectionTimeoutMS=5000)
        # Verify connection
        self.client.admin.command('ping')
        self.db = self.client[db_name]
        self.cases       = self.db["cases"]
        self.failed_files = self.db["failed_extractions"]

    def upsert_case(self, doc: dict) -> str:
        """
        Insert or update a case by original_filename (idempotent).
        Returns the string _id.
        """
        now = datetime.utcnow()
        # Remove created_at from the $set payload so it doesn't conflict
        # with $setOnInsert (MongoDB error code 40 if the same path appears in both)
        set_doc = {k: v for k, v in doc.items() if k != "created_at"}
        set_doc["updated_at"] = now
        result = self.cases.update_one(
            {"original_filename": doc["original_filename"]},
            {"$set": set_doc, "$setOnInsert": {"created_at": now}},
            upsert=True,
        )
        return str(result.upserted_id or "updated")

    def log_failure(self, filename: str, error: str):
        self.failed_files.update_one(
            {"original_filename": filename},
            {"$set": {
                "original_filename": filename,
                "error": error,
                "failed_at": datetime.utcnow(),
            }},
            upsert=True,
        )

    def create_indexes(self):
        """Set up indexes for fast querying."""
        self.cases.create_index([("citation", ASCENDING)])
        self.cases.create_index([("law_code", ASCENDING)])
        self.cases.create_index([("primary_sections", ASCENDING)])
        self.cases.create_index([("all_sections_cited", ASCENDING)])
        self.cases.create_index([("court", ASCENDING)])
        self.cases.create_index([("outcome", ASCENDING)])
        self.cases.create_index([("decision_date", ASCENDING)])
        self.cases.create_index([("appellant", ASCENDING)])
        self.cases.create_index([("respondent", ASCENDING)])
        # Full-text search across key fields
        self.cases.create_index([
            ("citation",      TEXT),
            ("case_name",     TEXT),
            ("headnotes",     TEXT),
            ("judgment_text", TEXT),
        ], name="full_text_search")
        print("  ✓ MongoDB indexes created.")

    def stats(self) -> dict:
        pipeline = [
            {"$group": {
                "_id": "$law_code",
                "count": {"$sum": 1},
                "outcomes": {"$push": "$outcome"},
            }}
        ]
        return list(self.cases.aggregate(pipeline))

    def close(self):
        self.client.close()


# ═══════════════════════════════════════════════════════════════════════════════
#  SECTION 5 ─ ZIP Processing Pipeline
# ═══════════════════════════════════════════════════════════════════════════════

def iter_pdf_entries(zip_path: str):
    """
    Yield (ZipInfo, bytes) for every PDF inside the ZIP,
    regardless of nesting depth.
    """
    with zipfile.ZipFile(zip_path, 'r') as zf:
        pdf_entries = [
            info for info in zf.infolist()
            if not info.is_dir() and info.filename.lower().endswith('.pdf')
        ]
        for info in pdf_entries:
            try:
                data = zf.read(info.filename)
                yield info, data
            except Exception as exc:
                print(f"  [WARN] Cannot read {info.filename}: {exc}")


def process_zip(zip_path: str, db: LawCasesDB,
                skip_existing: bool = True,
                verbose: bool = False) -> dict:
    """
    Main pipeline: iterate PDFs → extract text → parse → upsert to MongoDB.
    Returns a summary dict.
    """
    summary = {"total": 0, "success": 0, "skipped": 0, "failed": 0}

    with zipfile.ZipFile(zip_path, 'r') as zf:
        pdf_entries = [
            info for info in zf.infolist()
            if not info.is_dir() and info.filename.lower().endswith('.pdf')
        ]

    iterator = tqdm(pdf_entries, desc="Processing PDFs") if TQDM_AVAILABLE \
        else pdf_entries

    with zipfile.ZipFile(zip_path, 'r') as zf:
        for info in iterator:
            summary["total"] += 1
            filename = info.filename

            # Optionally skip already-processed files
            if skip_existing and db.cases.count_documents(
                    {"original_filename": filename}, limit=1):
                summary["skipped"] += 1
                if verbose:
                    print(f"  [SKIP] {filename}")
                continue

            try:
                pdf_bytes = zf.read(filename)
            except Exception as exc:
                print(f"  [ERROR] Reading {filename}: {exc}")
                db.log_failure(filename, str(exc))
                summary["failed"] += 1
                continue

            # ── Extract text ──────────────────────────────────────
            text = extract_text_from_bytes(pdf_bytes)
            if not text.strip():
                msg = "No text extracted (possibly scanned/image PDF)"
                print(f"  [WARN] {Path(filename).name}: {msg}")
                db.log_failure(filename, msg)
                summary["failed"] += 1
                continue

            # ── Parse metadata ────────────────────────────────────
            try:
                filename_meta = parse_filename(filename)
                document = parse_case_document(text, filename_meta)
            except Exception as exc:
                print(f"  [ERROR] Parsing {filename}: {exc}")
                db.log_failure(filename, str(exc))
                summary["failed"] += 1
                continue

            # ── Store in MongoDB ──────────────────────────────────
            try:
                db.upsert_case(document)
                summary["success"] += 1
                if verbose:
                    print(f"  [OK] {Path(filename).name} → {document['citation']}")
            except Exception as exc:
                print(f"  [ERROR] Storing {filename}: {exc}")
                db.log_failure(filename, str(exc))
                summary["failed"] += 1

    return summary


# ═══════════════════════════════════════════════════════════════════════════════
#  SECTION 6 ─ Example Queries (run after extraction)
# ═══════════════════════════════════════════════════════════════════════════════

def demo_queries(db: LawCasesDB):
    print("\n" + "═" * 60)
    print("SAMPLE QUERIES")
    print("═" * 60)

    # 1. All 302 PPC cases
    count = db.cases.count_documents({"primary_sections": "302"})
    print(f"\n[1] Cases under Section 302 PPC : {count}")

    # 2. Cases decided by Supreme Court
    count = db.cases.count_documents({"court": {"$regex": "Supreme Court", "$options": "i"}})
    print(f"[2] Supreme Court judgements     : {count}")

    # 3. Acquittals
    count = db.cases.count_documents({"outcome": "Acquitted"})
    print(f"[3] Acquittal outcomes           : {count}")

    # 4. Bail Granted
    count = db.cases.count_documents({"outcome": "Bail Granted"})
    print(f"[4] Bail Granted outcomes        : {count}")

    # 5. Full-text keyword search example
    results = list(db.cases.find(
        {"$text": {"$search": "ocular evidence enmity"}},
        {"citation": 1, "court": 1, "outcome": 1, "_id": 0}
    ).limit(3))
    print(f"\n[5] Full-text search 'ocular evidence enmity':")
    for r in results:
        print(f"    {r.get('citation','?')} | {r.get('court','?')} | {r.get('outcome','?')}")

    # 6. Breakdown by law code
    print("\n[6] Breakdown by law code:")
    for stat in db.stats():
        print(f"    {stat['_id']:10s} → {stat['count']} cases")


# ═══════════════════════════════════════════════════════════════════════════════
#  SECTION 7 ─ CLI Entry Point
# ═══════════════════════════════════════════════════════════════════════════════

def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        description="Extract law case PDFs from a ZIP and load into MongoDB."
    )
    p.add_argument(
        "--zip", required=True,
        help="Path to the ZIP file containing court judgement PDFs."
    )
    p.add_argument(
        "--mongo", default="mongodb://localhost:27017/",
        help="MongoDB connection URI (default: mongodb://localhost:27017/)."
    )
    p.add_argument(
        "--db", default="pakistan_law_db",
        help="MongoDB database name (default: pakistan_law_db)."
    )
    p.add_argument(
        "--no-skip", action="store_true",
        help="Re-process files that already exist in the database."
    )
    p.add_argument(
        "--verbose", "-v", action="store_true",
        help="Print per-file status messages."
    )
    p.add_argument(
        "--demo-queries", action="store_true",
        help="Run example queries after extraction and print results."
    )
    return p


def main():
    args = build_parser().parse_args()

    # ── Validate ZIP path ─────────────────────────────────────────
    if not os.path.isfile(args.zip):
        sys.exit(f"[ERROR] ZIP file not found: {args.zip}")

    print(f"\n{'═'*60}")
    print("  LAW CASES → MONGODB EXTRACTOR")
    print(f"{'═'*60}")
    print(f"  ZIP      : {args.zip}")
    print(f"  MongoDB  : {args.mongo}")
    print(f"  Database : {args.db}")
    print(f"{'═'*60}\n")

    # ── Connect to MongoDB ────────────────────────────────────────
    try:
        db = LawCasesDB(args.mongo, args.db)
        print("  ✓ Connected to MongoDB.")
    except Exception as exc:
        sys.exit(f"[ERROR] Cannot connect to MongoDB: {exc}")

    # ── Run extraction pipeline ───────────────────────────────────
    print("\nCreating indexes …")
    db.create_indexes()

    print("\nProcessing PDFs …")
    summary = process_zip(
        zip_path=args.zip,
        db=db,
        skip_existing=not args.no_skip,
        verbose=args.verbose,
    )

    # ── Print summary ─────────────────────────────────────────────
    print(f"\n{'─'*60}")
    print("  EXTRACTION SUMMARY")
    print(f"{'─'*60}")
    print(f"  Total PDFs found : {summary['total']}")
    print(f"  Successfully stored : {summary['success']}")
    print(f"  Skipped (exist)  : {summary['skipped']}")
    print(f"  Failed           : {summary['failed']}")
    print(f"{'─'*60}")

    if args.demo_queries:
        demo_queries(db)

    db.close()
    print("\n  Done.\n")


if __name__ == "__main__":
    main()