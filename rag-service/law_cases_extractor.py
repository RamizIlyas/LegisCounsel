"""
Law Cases / Judgements — Flexible PDF to MongoDB Extractor
===========================================================
Extracts Pakistani court judgement PDFs and stores rich metadata in MongoDB.

Accepts:
  • A single ZIP archive containing PDFs
  • One or more individual PDF files passed on the command line
  • A directory of PDFs (scanned recursively)

Requirements:
    pip install pymongo pdfminer.six PyPDF2 tqdm

Usage examples:
    # ZIP archive
    python law_cases_extractor.py --input cases.zip

    # One or more individual PDFs
    python law_cases_extractor.py --input judgment1.pdf judgment2.pdf

    # Directory (recursive)
    python law_cases_extractor.py --input /path/to/pdfs/

    # Mix ZIP + directory + individual files
    python law_cases_extractor.py --input cases.zip /extra/dir file.pdf

    # Common options
    python law_cases_extractor.py --input cases.zip \\
        --mongo mongodb://localhost:27017/ --db LegisCounsel \\
        --no-skip --verbose --demo-queries

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
from typing import Generator, Tuple

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
    stem = Path(filename).stem
    stem_clean = stem.strip()

    match = _SECTION_RE.search(stem_clean)
    legal_sections: list[str] = []
    law_code = "UNKNOWN"

    if match:
        raw_sections = match.group("sections").strip()
        law_code = match.group("law").upper()
        legal_sections = [s.strip() for s in raw_sections.split() if s.strip()]
        case_name_raw = stem_clean[: match.start()].strip(" _-")
    else:
        case_name_raw = stem_clean

    case_name_clean = re.sub(r'[_\-]+', ' ', case_name_raw).strip()
    case_name_clean = re.sub(r'\s{2,}', ' ', case_name_clean)

    return {
        "original_filename": filename,
        "file_stem": stem_clean,
        "case_name_raw": case_name_clean,
        "legal_sections": legal_sections,
        "law_code": law_code,
    }


# ═══════════════════════════════════════════════════════════════════════════════
#  SECTION 3 ─ Content Parsing (regex-based NLP)
# ═══════════════════════════════════════════════════════════════════════════════

def _first_match(patterns: list[str], text: str,
                 flags=re.IGNORECASE | re.MULTILINE) -> str | None:
    for pat in patterns:
        m = re.search(pat, text, flags)
        if m:
            return m.group(1).strip()
    return None


def _clean(s: str | None) -> str:
    if not s:
        return ""
    return re.sub(r'\s+', ' ', s).strip()


def parse_citation(text: str) -> str:
    patterns = [
        r'^\s*(\d{4}\s+S\s+C\s+M\s+R\s+\d+)',
        r'(PLD\s+\d{4}\s+\w+\s+\d+)',
        r'(\d{4}[A-Z]{2,5}\d+)',
        r'(SBLR[-\s]\d{4}[-\s]\w+[-\s]\d+)',
        r'(\d{4}[-\s]?Pcrlj[-\s]?\d+)',
    ]
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
    m = re.search(
        r'(?:Present|CORAM)\s*:\s*([^\n]{10,200})',
        text[:2000], re.IGNORECASE
    )
    if not m:
        return []
    raw = m.group(1)
    raw = re.sub(r'\b(?:JJ?\.?|C\.?J\.?)\b', '', raw, flags=re.IGNORECASE)
    names = re.split(r'\s*(?:and|,|;)\s*', raw)
    return [_clean(n) for n in names if len(_clean(n)) > 3]


def parse_parties(text: str) -> tuple[str, str]:
    header = text[:2500]
    appellant, respondent = "", ""

    m = re.search(
        r'\n([A-Z][A-Z\s\.\-\(\)]{3,70})[-─]{2,4}\s*'
        r'(?:Appellant|Petitioner|Applicant)',
        header
    )
    if m:
        appellant = re.sub(r'^[A-Z]{1,3}\s+', '', m.group(1)).strip(' -─')
        appellant = _clean(appellant)

    m = re.search(
        r'\n([A-Z][A-Z\s\.\-\(\)]{3,70})[-─]{2,4}\s*'
        r'(?:Respondent|Respondents|The State)',
        header
    )
    if m:
        respondent = _clean(m.group(1).strip(' -─'))

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
    pattern = re.compile(
        r'(?:Criminal Appeal|Civil Appeal|W\.?P\.?|Cr\.?A\.?|Jail Petition|'
        r'Crl\.?\s*Revision|Sessions Case|Cr\.\s*Misc\.?|Constitution Petition)'
        r'\s*No[s]?\.\s*[\d\-\/A-Za-z]+(?:\s+of\s+\d{4})?',
        re.IGNORECASE,
    )
    return list(dict.fromkeys(
        _clean(m.group()) for m in pattern.finditer(text[:3000])
    ))


def parse_decision_date(text: str) -> str:
    patterns = [
        r'decided\s+on\s+(\d{1,2}(?:st|nd|rd|th)?\s+\w+,?\s*\d{4})',
        r'(?:Date of (?:hearing|judgment|decision)|Order dated?)\s*[:\-]?\s*'
        r'(\d{1,2}[./\-]\d{1,2}[./\-]\d{2,4})',
        r'(?:Date of (?:hearing|judgment|decision)|Order dated?)\s*[:\-]?\s*'
        r'(\d{1,2}\s+\w+,?\s+\d{4})',
        r'(\d{1,2}(?:st|nd|rd|th)?\s+\w+,?\s+\d{4})',
    ]
    return _clean(_first_match(patterns, text[:3000]))


def parse_headnotes(text: str) -> list[str]:
    judgment_pos = re.search(r'\bJUDGMENT\b', text, re.IGNORECASE)
    header_text = text[: judgment_pos.start()] if judgment_pos else text[:4000]
    raw = re.findall(r'[-─]{3,}\s*(.+?)(?=\n[-─]{3,}|\n\n|\Z)', header_text, re.DOTALL)
    cleaned = [_clean(r) for r in raw if len(_clean(r)) > 20]
    return cleaned[:15]


def parse_sections_mentioned(text: str) -> list[str]:
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
        if re.match(r'^\d{1,4}[A-Z\-]*$', num):
            found.add(f"{num} {law}")
    return sorted(found)


def parse_outcome(text: str) -> str:
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
    result = {"appellant_counsel": [], "respondent_counsel": []}
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
    result["appellant_counsel"] = list(dict.fromkeys(result["appellant_counsel"]))
    result["respondent_counsel"] = list(dict.fromkeys(result["respondent_counsel"]))
    return result


def parse_judgment_body(text: str) -> str:
    m = re.search(r'\bJUDGMENT\b', text, re.IGNORECASE)
    if m:
        return text[m.start():].strip()
    return text.strip()


def parse_case_document(text: str, filename_meta: dict) -> dict:
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

    all_sections = list(dict.fromkeys(
        [f"{s} {filename_meta['law_code']}" for s in filename_meta["legal_sections"]]
        + sections
    ))

    return {
        "citation":           citation or filename_meta["file_stem"],
        "case_name":          filename_meta["case_name_raw"],
        "original_filename":  filename_meta["original_filename"],
        "appellant":          appellant,
        "respondent":         respondent,
        "court":              court,
        "judges":             judges,
        "law_code":           filename_meta["law_code"],
        "primary_sections":   filename_meta["legal_sections"],
        "all_sections_cited": all_sections,
        "case_numbers":       case_nos,
        "decision_date":      date_str,
        "outcome":            outcome,
        "headnotes":          headnotes,
        "advocates":          advocates,
        "judgment_text":      judgment,
        "full_text":          text,
        "word_count":         len(text.split()),
        "page_count_estimate": max(1, len(text) // 3000),
        "document_type":      "court_judgement",
        "created_at":         datetime.utcnow(),
        "updated_at":         datetime.utcnow(),
    }


# ═══════════════════════════════════════════════════════════════════════════════
#  SECTION 4 ─ MongoDB Storage
# ═══════════════════════════════════════════════════════════════════════════════

class LawCasesDB:
    def __init__(self, mongo_uri: str, db_name: str):
        self.client = MongoClient(mongo_uri, serverSelectionTimeoutMS=5000)
        self.client.admin.command('ping')
        self.db = self.client[db_name]
        self.cases        = self.db["judgements"]
        self.failed_files = self.db["failed_extractions"]

    def upsert_case(self, doc: dict) -> str:
        now = datetime.utcnow()
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
        self.cases.create_index([("citation",    ASCENDING)])
        self.cases.create_index([("law_code",    ASCENDING)])
        self.cases.create_index([("primary_sections",   ASCENDING)])
        self.cases.create_index([("all_sections_cited", ASCENDING)])
        self.cases.create_index([("court",       ASCENDING)])
        self.cases.create_index([("outcome",     ASCENDING)])
        self.cases.create_index([("decision_date", ASCENDING)])
        self.cases.create_index([("appellant",   ASCENDING)])
        self.cases.create_index([("respondent",  ASCENDING)])
        self.cases.create_index([
            ("citation",      TEXT),
            ("case_name",     TEXT),
            ("headnotes",     TEXT),
            ("judgment_text", TEXT),
        ], name="full_text_search")
        print("  ✓ MongoDB indexes created.")

    def already_exists(self, filename: str) -> bool:
        return bool(self.cases.count_documents(
            {"original_filename": filename}, limit=1
        ))

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
#  SECTION 5 ─ Input Source Iterators
# ═══════════════════════════════════════════════════════════════════════════════

# Each iterator yields (logical_filename: str, pdf_bytes: bytes)
# "logical_filename" is used as the unique key stored in MongoDB
# (e.g. "cases.zip/sub/foo.pdf" for ZIP entries, absolute path for loose files).

def _iter_zip(zip_path: str) -> Generator[Tuple[str, bytes], None, None]:
    """Yield (logical_name, bytes) for every PDF inside a ZIP archive."""
    zip_name = Path(zip_path).name
    with zipfile.ZipFile(zip_path, 'r') as zf:
        pdf_entries = [
            info for info in zf.infolist()
            if not info.is_dir() and info.filename.lower().endswith('.pdf')
        ]
        for info in pdf_entries:
            try:
                data = zf.read(info.filename)
                # Prefix with zip name so paths stay unique across multiple ZIPs
                logical = f"{zip_name}/{info.filename}"
                yield logical, data
            except Exception as exc:
                print(f"  [WARN] Cannot read {info.filename} from {zip_name}: {exc}")


def _iter_pdf_file(pdf_path: str) -> Generator[Tuple[str, bytes], None, None]:
    """Yield (logical_name, bytes) for a single PDF file on disk."""
    path = Path(pdf_path).resolve()
    try:
        yield str(path), path.read_bytes()
    except Exception as exc:
        print(f"  [WARN] Cannot read {pdf_path}: {exc}")


def _iter_directory(dir_path: str) -> Generator[Tuple[str, bytes], None, None]:
    """Recursively yield (logical_name, bytes) for every PDF under a directory."""
    root = Path(dir_path).resolve()
    pdf_files = sorted(root.rglob("*.pdf"))
    if not pdf_files:
        print(f"  [WARN] No PDF files found under: {dir_path}")
        return
    for pdf_path in pdf_files:
        try:
            yield str(pdf_path), pdf_path.read_bytes()
        except Exception as exc:
            print(f"  [WARN] Cannot read {pdf_path}: {exc}")


def build_source_list(inputs: list[str]) -> list[Tuple[str, Generator]]:
    """
    Classify each item in `inputs` as a ZIP / PDF file / directory
    and return a flat list of (source_label, iterator).

    Raises SystemExit on invalid paths.
    """
    sources: list[Tuple[str, Generator]] = []
    for item in inputs:
        p = Path(item)
        if not p.exists():
            print(f"  [ERROR] Path does not exist, skipping: {item}")
            continue

        if p.is_dir():
            print(f"  • Directory  : {item}")
            sources.append((item, _iter_directory(item)))

        elif p.suffix.lower() == '.zip':
            print(f"  • ZIP archive: {item}")
            sources.append((item, _iter_zip(item)))

        elif p.suffix.lower() == '.pdf':
            print(f"  • PDF file   : {item}")
            sources.append((item, _iter_pdf_file(item)))

        else:
            print(f"  [WARN] Unsupported file type, skipping: {item}")

    return sources


# ═══════════════════════════════════════════════════════════════════════════════
#  SECTION 6 ─ Core Processing Pipeline
# ═══════════════════════════════════════════════════════════════════════════════

def _process_single(
    logical_filename: str,
    pdf_bytes: bytes,
    db: LawCasesDB,
    skip_existing: bool,
    verbose: bool,
    summary: dict,
):
    """Parse and upsert a single PDF represented as bytes."""
    summary["total"] += 1

    if skip_existing and db.already_exists(logical_filename):
        summary["skipped"] += 1
        if verbose:
            print(f"  [SKIP] {logical_filename}")
        return

    # ── Extract text ──────────────────────────────────────────────
    text = extract_text_from_bytes(pdf_bytes)
    if not text.strip():
        msg = "No text extracted (possibly scanned/image PDF)"
        print(f"  [WARN] {Path(logical_filename).name}: {msg}")
        db.log_failure(logical_filename, msg)
        summary["failed"] += 1
        return

    # ── Parse metadata ────────────────────────────────────────────
    try:
        filename_meta = parse_filename(logical_filename)
        document = parse_case_document(text, filename_meta)
    except Exception as exc:
        print(f"  [ERROR] Parsing {logical_filename}: {exc}")
        db.log_failure(logical_filename, str(exc))
        summary["failed"] += 1
        return

    # ── Store in MongoDB ──────────────────────────────────────────
    try:
        db.upsert_case(document)
        summary["success"] += 1
        if verbose:
            print(f"  [OK] {Path(logical_filename).name} → {document['citation']}")
    except Exception as exc:
        print(f"  [ERROR] Storing {logical_filename}: {exc}")
        db.log_failure(logical_filename, str(exc))
        summary["failed"] += 1


def process_inputs(
    inputs: list[str],
    db: LawCasesDB,
    skip_existing: bool = True,
    verbose: bool = False,
) -> dict:
    """
    Master pipeline entry-point.

    Accepts any mix of ZIP archives, individual PDF files, and directories.
    Returns a summary dict: {total, success, skipped, failed}.
    """
    summary = {"total": 0, "success": 0, "skipped": 0, "failed": 0}

    # ── Classify inputs ───────────────────────────────────────────
    sources = build_source_list(inputs)
    if not sources:
        print("  [ERROR] No valid input sources found.")
        return summary

    # ── Collect all (filename, bytes) pairs across every source ───
    # We materialise the list so tqdm can show an accurate count.
    all_pdfs: list[Tuple[str, bytes]] = []
    for _label, iterator in sources:
        all_pdfs.extend(iterator)

    if not all_pdfs:
        print("  [ERROR] No PDF files discovered across all inputs.")
        return summary

    print(f"\n  Total PDFs discovered: {len(all_pdfs)}\n")

    iterable = (
        tqdm(all_pdfs, desc="Processing PDFs", unit="file")
        if TQDM_AVAILABLE else all_pdfs
    )

    for logical_filename, pdf_bytes in iterable:
        _process_single(
            logical_filename, pdf_bytes,
            db, skip_existing, verbose, summary,
        )

    return summary


# ── Convenience wrappers kept for backward-compatibility ─────────────────────

def process_zip(zip_path: str, db: LawCasesDB,
                skip_existing: bool = True, verbose: bool = False) -> dict:
    """Legacy wrapper — delegates to process_inputs."""
    return process_inputs([zip_path], db,
                          skip_existing=skip_existing, verbose=verbose)


def process_pdf_files(pdf_paths: list[str], db: LawCasesDB,
                      skip_existing: bool = True, verbose: bool = False) -> dict:
    """Legacy wrapper — delegates to process_inputs."""
    return process_inputs(pdf_paths, db,
                          skip_existing=skip_existing, verbose=verbose)


def process_directory(dir_path: str, db: LawCasesDB,
                      skip_existing: bool = True, verbose: bool = False) -> dict:
    """Legacy wrapper — delegates to process_inputs."""
    return process_inputs([dir_path], db,
                          skip_existing=skip_existing, verbose=verbose)


# ═══════════════════════════════════════════════════════════════════════════════
#  SECTION 7 ─ Example Queries (run after extraction)
# ═══════════════════════════════════════════════════════════════════════════════

def demo_queries(db: LawCasesDB):
    print("\n" + "═" * 60)
    print("SAMPLE QUERIES")
    print("═" * 60)

    count = db.cases.count_documents({"primary_sections": "302"})
    print(f"\n[1] Cases under Section 302 PPC : {count}")

    count = db.cases.count_documents({"court": {"$regex": "Supreme Court", "$options": "i"}})
    print(f"[2] Supreme Court judgements     : {count}")

    count = db.cases.count_documents({"outcome": "Acquitted"})
    print(f"[3] Acquittal outcomes           : {count}")

    count = db.cases.count_documents({"outcome": "Bail Granted"})
    print(f"[4] Bail Granted outcomes        : {count}")

    results = list(db.cases.find(
        {"$text": {"$search": "ocular evidence enmity"}},
        {"citation": 1, "court": 1, "outcome": 1, "_id": 0}
    ).limit(3))
    print(f"\n[5] Full-text search 'ocular evidence enmity':")
    for r in results:
        print(f"    {r.get('citation','?')} | {r.get('court','?')} | {r.get('outcome','?')}")

    print("\n[6] Breakdown by law code:")
    for stat in db.stats():
        print(f"    {stat['_id']:10s} → {stat['count']} cases")


# ═══════════════════════════════════════════════════════════════════════════════
#  SECTION 8 ─ CLI Entry Point
# ═══════════════════════════════════════════════════════════════════════════════

def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        description=(
            "Extract law case PDFs from ZIPs, loose files, or directories "
            "and load everything into MongoDB.\n\n"
            "Examples:\n"
            "  %(prog)s --input cases.zip\n"
            "  %(prog)s --input /judgements/2024/\n"
            "  %(prog)s --input a.pdf b.pdf c.pdf\n"
            "  %(prog)s --input cases.zip /extra/dir standalone.pdf"
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    p.add_argument(
        "--input", "-i",
        nargs="+",
        required=True,
        metavar="PATH",
        help=(
            "One or more input sources. Each may be:\n"
            "  • A .zip file containing PDFs\n"
            "  • A .pdf file\n"
            "  • A directory (searched recursively for PDFs)\n"
            "Multiple values are accepted and processed together."
        ),
    )
    p.add_argument(
        "--mongo", default="mongodb://localhost:27017/",
        help="MongoDB connection URI (default: mongodb://localhost:27017/)."
    )
    p.add_argument(
        "--db", default="LegisCounsel",
        help="MongoDB database name (default: LegisCounsel)."
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

    print(f"\n{'═'*60}")
    print("  LAW CASES → MONGODB EXTRACTOR")
    print(f"{'═'*60}")
    print(f"  Input(s) : {', '.join(args.input)}")
    print(f"  MongoDB  : {args.mongo}")
    print(f"  Database : {args.db}")
    print(f"{'═'*60}\n")

    # ── Connect to MongoDB ────────────────────────────────────────
    try:
        db = LawCasesDB(args.mongo, args.db)
        print("  ✓ Connected to MongoDB.")
    except Exception as exc:
        sys.exit(f"[ERROR] Cannot connect to MongoDB: {exc}")

    print("\nCreating indexes …")
    db.create_indexes()

    print("\nScanning inputs …")
    summary = process_inputs(
        inputs=args.input,
        db=db,
        skip_existing=not args.no_skip,
        verbose=args.verbose,
    )

    # ── Print summary ─────────────────────────────────────────────
    print(f"\n{'─'*60}")
    print("  EXTRACTION SUMMARY")
    print(f"{'─'*60}")
    print(f"  Total PDFs found    : {summary['total']}")
    print(f"  Successfully stored : {summary['success']}")
    print(f"  Skipped (exist)     : {summary['skipped']}")
    print(f"  Failed              : {summary['failed']}")
    print(f"{'─'*60}")

    if args.demo_queries:
        demo_queries(db)

    db.close()
    print("\n  Done.\n")


if __name__ == "__main__":
    main()