"""
Pakistani Law Documents — PDF to MongoDB Extractor
====================================================
v2 fix: parse_sections() is now called against body_text (not full_text)
so that section positions are correct character offsets into body_text.
This fixes the garbled / truncated section text that appeared when the
vector DB sliced body_text[position:next_position].

All other logic is identical to v1.
"""

from __future__ import annotations

import argparse
import io
import os
import re
import sys
import zipfile
from datetime import datetime
from pathlib import Path
from typing import Generator

try:
    from pymongo import MongoClient, ASCENDING, TEXT
except ImportError:
    sys.exit("pymongo not found. Run: pip install pymongo")

try:
    import pdfminer.high_level as pdfminer_hl
    from pdfminer.layout import LAParams
except ImportError:
    sys.exit("pdfminer.six not found. Run: pip install pdfminer.six")

try:
    from tqdm import tqdm
    _TQDM = True
except ImportError:
    _TQDM = False


# ══════════════════════════════════════════════════════════════════════════════
#  SECTION 1 — PDF Text Extraction
# ══════════════════════════════════════════════════════════════════════════════

def extract_text_from_bytes(pdf_bytes: bytes) -> str:
    try:
        text = pdfminer_hl.extract_text(
            io.BytesIO(pdf_bytes),
            laparams=LAParams(
                line_margin=0.5,
                char_margin=2.0,
                word_margin=0.1,
                boxes_flow=0.5,
            ),
        )
        if text and len(text.strip()) > 80:
            return text
    except Exception as exc:
        print(f"    [WARN] pdfminer failed: {exc}")
    return ""


# ══════════════════════════════════════════════════════════════════════════════
#  SECTION 2 — Filename Metadata Parsing
# ══════════════════════════════════════════════════════════════════════════════

_YEAR_RE = re.compile(r'\b(1[6-9]\d{2}|20[0-2]\d)\b')

_ACT_NO_RE = re.compile(
    r'\b(?:Act|Ordinance|Order|Regulation|Decree)\s*'
    r'(?:No\.?\s*)?([IVXLCDM\d]+)\s+of\s+(\d{4})',
    re.IGNORECASE,
)

_DOC_TYPE_PATTERNS: list[tuple[str, str]] = [
    (r'\bAmendment\b',  'Amendment'),
    (r'\bOrdinance\b',  'Ordinance'),
    (r'\bOrder\b',      'Order'),
    (r'\bRegulation\b', 'Regulation'),
    (r'\bCode\b',       'Code'),
    (r'\bRules?\b',     'Rules'),
    (r'\bHandbook\b',   'Handbook'),
    (r'\bCompendium\b', 'Compendium'),
    (r'\bSchedule\b',   'Schedule'),
    (r'\bBill\b',       'Bill'),
    (r'\bManual\b',     'Manual'),
    (r'\bAct\b',        'Act'),
]


def infer_doc_type(text: str) -> str:
    for pattern, label in _DOC_TYPE_PATTERNS:
        if re.search(pattern, text, re.IGNORECASE):
            return label
    return 'Statute'


def parse_filename(filename: str) -> dict:
    stem = Path(filename).stem
    stem_clean = re.sub(r'^\d+', '', stem).strip(" _-")
    readable = re.sub(r'[-_]+', ' ', stem_clean).strip()
    readable = re.sub(r'\s{2,}', ' ', readable)
    years = _YEAR_RE.findall(stem_clean)
    return {
        "original_filename":      filename,
        "file_stem":              stem_clean,
        "title_from_filename":    readable,
        "year_from_filename":     years[0] if years else None,
        "doc_type_from_filename": infer_doc_type(stem_clean),
    }


# ══════════════════════════════════════════════════════════════════════════════
#  SECTION 3 — Content Metadata Parsing
# ══════════════════════════════════════════════════════════════════════════════

def _first_match(patterns: list[str], text: str,
                 flags: int = re.IGNORECASE | re.MULTILINE) -> str | None:
    for pat in patterns:
        m = re.search(pat, text, flags)
        if m:
            return m.group(1).strip()
    return None


def _clean(s: str | None) -> str:
    return re.sub(r'\s+', ' ', s).strip() if s else ""


def parse_law_title(text: str) -> str:
    header = text[:2000]
    patterns = [
        r'^([A-Z][A-Z\s\(\),\.\-]{15,120})\s*\n',
        r'(?:called|known as)\s+(?:the\s+)?\u201c?([A-Z][^\n\u201d]{10,100})\u201d?',
        r'(?:called|known as)\s+(?:the\s+)?"([A-Z][^\n"]{10,100})"',
        r'([A-Z][a-zA-Z\s\(\),\.]{10,100})\s*\n\s*\(?Act\s+[IVXLCDM\d]',
    ]
    result = _clean(_first_match(patterns, header))
    return re.sub(r'[\.,;:]+$', '', result).strip()


def parse_act_number_and_year(text: str) -> tuple[str, str]:
    header = text[:3000]
    m = _ACT_NO_RE.search(header)
    if m:
        return m.group(1).strip(), m.group(2).strip()
    year_m = _YEAR_RE.search(header)
    return "", (year_m.group(1) if year_m else "")


_JURISDICTION_MAP: list[tuple[str, str]] = [
    (r'\bPunjab\b',                               'Punjab'),
    (r'\bSindh\b',                                'Sindh'),
    (r'\bKhyber[\s\-]Pakhtunkhwa\b|\bKPK?\b',    'KPK'),
    (r'\bBalochistan\b',                          'Balochistan'),
    (r'\bGilgit[\s\-]Baltistan\b',               'Gilgit-Baltistan'),
    (r'\bAzad\s+(?:Jammu|Kashmir)\b|\bAJK\b',    'AJK'),
    (r'\bIslamabad\b',                            'Islamabad'),
    (r'\bWest\s+Pakistan\b',                      'West Pakistan (Historical)'),
]


def parse_jurisdiction(text: str, filename: str = "") -> str:
    combined = filename + " " + text[:2000]
    for pattern, label in _JURISDICTION_MAP:
        if re.search(pattern, combined, re.IGNORECASE):
            return label
    return "Pakistan (Federal)"


def parse_enacting_authority(text: str) -> str:
    header = text[:2000]
    if re.search(r'National\s+Assembly', header, re.IGNORECASE):
        return "National Assembly of Pakistan"
    if re.search(r'Provincial\s+Assembly', header, re.IGNORECASE):
        return "Provincial Assembly"
    if re.search(r'President\s+of\s+Pakistan', header, re.IGNORECASE):
        return "President of Pakistan"
    if re.search(r'Governor(?:\s+General)?', header, re.IGNORECASE):
        return "Governor General / Governor"
    return ""


def parse_dates(text: str) -> dict:
    header = text[:3000]
    date_pats = [
        r'(\d{1,2}(?:st|nd|rd|th)?\s+\w+,?\s+\d{4})',
        r'(\d{1,2}[./\-]\d{1,2}[./\-]\d{2,4})',
        r'(\w+\s+\d{1,2},?\s+\d{4})',
    ]

    def find_date(keyword: str) -> str:
        for dpat in date_pats:
            m = re.search(rf'{keyword}\s*[:\-]?\s*{dpat}', header, re.IGNORECASE)
            if m:
                return _clean(m.group(1))
        return ""

    return {
        "enactment_date":    find_date(r'(?:enacted|passed|dated?)'),
        "assent_date":       find_date(r'(?:assent|assented|received assent)'),
        "commencement_date": find_date(r'(?:commencement|came into force|in force)'),
    }


def parse_preamble(text: str) -> str:
    m = re.search(
        r'(?:Whereas|An (?:Act|Ordinance|Order)\s+to)\s+(.{30,800}?)(?:\n\n|\Z)',
        text[:3000], re.IGNORECASE | re.DOTALL,
    )
    return _clean(m.group(0)) if m else ""


def parse_chapters(text: str) -> list[dict]:
    """Parse chapter headings from body_text (positions are body_text offsets)."""
    pattern = re.compile(
        r'CHAPTER[S]?\s*[-\u2013]?\s*([IVXLCDM\d]+)\s*\n\s*([A-Z][^\n]{3,100})',
        re.MULTILINE,
    )
    return [
        {"number": m.group(1).strip(), "title": _clean(m.group(2)), "position": m.start()}
        for m in pattern.finditer(text)
    ]


# ── KEY FIX: sections are now parsed from body_text, not full_text ────────────

def parse_sections(text: str) -> list[dict]:
    """
    Extract numbered section headings.

    IMPORTANT: Always call this with body_text (not full_text) so that
    the returned `position` values are correct character offsets into
    body_text.  The vector DB slices body_text[position:next_position]
    to recover each section's raw text.
    """
    pattern = re.compile(
        r'^\s{0,6}(\d{1,4}[A-Z]?)\.\s{1,6}([A-Z][^\n]{5,120})',
        re.MULTILINE,
    )
    sections: list[dict] = []
    seen: set[str] = set()
    for m in pattern.finditer(text):
        num, heading = m.group(1).strip(), _clean(m.group(2))
        key = f"{num}:{heading[:30]}"
        if key not in seen and len(heading) > 5:
            seen.add(key)
            sections.append({
                "number":   num,
                "heading":  heading,
                "position": m.start(),   # ← offset into body_text ✅
            })
        if len(sections) >= 500:
            break
    return sections


def parse_amendments(text: str) -> list[str]:
    pattern = re.compile(
        r'([A-Z][^\n]{5,80}(?:Amendment|Amending)[^\n]{0,60}'
        r'(?:Act|Ordinance)[^\n]{0,30}\d{4})',
        re.IGNORECASE,
    )
    found, seen = [], set()
    for m in pattern.finditer(text[:5000]):
        val = _clean(m.group(1))
        if val not in seen:
            seen.add(val)
            found.append(val)
    return found[:20]


def parse_related_laws(text: str) -> list[str]:
    pattern = re.compile(
        r'(?:the\s+)?([A-Z][A-Za-z\s\(\)]{8,80}'
        r'(?:Act|Code|Ordinance|Rules|Order)\s*(?:,?\s*\d{4})?)',
        re.MULTILINE,
    )
    found, seen = [], set()
    for m in pattern.finditer(text):
        val = _clean(m.group(1))
        if 10 < len(val) < 120 and val not in seen:
            seen.add(val)
            found.append(val)
        if len(found) >= 40:
            break
    return found


def parse_definitions(text: str) -> list[dict]:
    m = re.search(r'(?:Definitions?|Interpretation)\s*[:\.\n]', text, re.IGNORECASE)
    if not m:
        return []
    block = text[m.start(): m.start() + 4000]
    defn_re = re.compile(
        r'["\u201c]([^"\u201d\n]{2,60})["\u201d]\s+means?\s+([^;\.]{10,300})',
        re.DOTALL,
    )
    results = []
    for dm in defn_re.finditer(block):
        results.append({"term": _clean(dm.group(1)), "definition": _clean(dm.group(2))})
        if len(results) >= 30:
            break
    return results


def parse_penalties(text: str) -> list[str]:
    pattern = re.compile(
        r'(?:punished?|sentenced?|liable)\s+(?:with|to)\s+([^\n\.;]{10,200})',
        re.IGNORECASE,
    )
    found, seen = [], set()
    for m in pattern.finditer(text):
        val = _clean(m.group(0))
        if val not in seen:
            seen.add(val)
            found.append(val)
        if len(found) >= 25:
            break
    return found


def parse_schedule_titles(text: str) -> list[str]:
    pattern = re.compile(
        r'SCHEDULE\s*[-\u2013]?\s*([IVXLCDM\d]*)\s*\n?\s*([A-Z][^\n]{0,100})?',
        re.MULTILINE,
    )
    results = []
    for m in pattern.finditer(text):
        label = f"Schedule {m.group(1)}".strip()
        if m.group(2):
            label += f" — {_clean(m.group(2))}"
        results.append(label)
    return list(dict.fromkeys(results))[:10]


def parse_toc(text: str) -> list[str]:
    pattern = re.compile(r'^\s{0,4}(\d{1,3})\.\s+([A-Z][^\n]{5,100})', re.MULTILINE)
    return [
        f"{m.group(1)}. {_clean(m.group(2))}"
        for m in pattern.finditer(text[:5000])
    ][:60]


def extract_body_text(text: str) -> str:
    """Strip TOC / front matter and return text starting from the enacting clause."""
    for marker in (
        r'It is hereby enacted',
        r'Be it enacted',
        r'Whereas it is expedient',
        r'CHAPTER\s+I\b',
        r'PART\s+I\b',
    ):
        m = re.search(marker, text, re.IGNORECASE)
        if m and m.start() > 200:
            return text[m.start():].strip()
    return text.strip()


# ── Master Parser ─────────────────────────────────────────────────────────────

def parse_law_document(
    text: str,
    filename_meta: dict,
    pdf_path: str | None = None,
) -> dict:
    """
    Combine filename metadata and content-parsed fields into one MongoDB document.

    KEY CHANGE vs v1: parse_sections() is called on body_text so that
    section positions are correct offsets for downstream slicing.
    """
    title         = parse_law_title(text)
    act_no, year  = parse_act_number_and_year(text)
    jurisdiction  = parse_jurisdiction(text, filename_meta["original_filename"])
    authority     = parse_enacting_authority(text)
    dates         = parse_dates(text)
    preamble      = parse_preamble(text)
    chapters      = parse_chapters(text)
    amendments    = parse_amendments(text)
    related       = parse_related_laws(text)
    definitions   = parse_definitions(text)
    penalties     = parse_penalties(text)
    schedules     = parse_schedule_titles(text)
    toc           = parse_toc(text)
    body          = extract_body_text(text)
    doc_type      = infer_doc_type(title or filename_meta["title_from_filename"])

    # ── FIXED: parse sections from body_text so positions are body offsets ────
    sections = parse_sections(body)

    return {
        # ── Identity ──────────────────────────────────────────────
        "title":             title or filename_meta["title_from_filename"],
        "act_number":        act_no,
        "year":              year or filename_meta.get("year_from_filename", ""),
        "doc_type":          doc_type,
        "original_filename": filename_meta["original_filename"],
        "file_stem":         filename_meta["file_stem"],

        # ── Classification ────────────────────────────────────────
        "jurisdiction":       jurisdiction,
        "enacting_authority": authority,

        # ── Dates ─────────────────────────────────────────────────
        "enactment_date":    dates["enactment_date"],
        "assent_date":       dates["assent_date"],
        "commencement_date": dates["commencement_date"],

        # ── Structure ─────────────────────────────────────────────
        "preamble":          preamble,
        "table_of_contents": toc,
        "chapters":          chapters,
        "sections":          sections,   # positions are now body_text offsets ✅
        "schedules":         schedules,
        "chapter_count":     len(chapters),
        "section_count":     len(sections),

        # ── Legal Content ─────────────────────────────────────────
        "amendments_referenced": amendments,
        "related_laws":          related,
        "defined_terms":         definitions,
        "penalty_clauses":       penalties,

        # ── Full Text ─────────────────────────────────────────────
        "body_text":  body,
        "full_text":  text,

        # ── Housekeeping ──────────────────────────────────────────
        "pdf_path":            pdf_path or "",
        "word_count":          len(text.split()),
        "page_count_estimate": max(1, len(text) // 3000),
        "document_category":   "legislation",
        "created_at":          datetime.utcnow(),
        "updated_at":          datetime.utcnow(),
    }


# ══════════════════════════════════════════════════════════════════════════════
#  SECTION 4 — MongoDB Storage (unchanged)
# ══════════════════════════════════════════════════════════════════════════════

class LawDB:
    def __init__(self, mongo_uri: str, db_name: str):
        self.client = MongoClient(mongo_uri, serverSelectionTimeoutMS=5_000)
        self.client.admin.command("ping")
        self.db     = self.client[db_name]
        self.laws   = self.db["laws"]
        self.failed = self.db["failed_extractions"]

    def upsert(self, doc: dict) -> str:
        now = datetime.utcnow()
        set_doc = {k: v for k, v in doc.items() if k != "created_at"}
        set_doc["updated_at"] = now
        result = self.laws.update_one(
            {"original_filename": doc["original_filename"]},
            {"$set": set_doc, "$setOnInsert": {"created_at": now}},
            upsert=True,
        )
        return str(result.upserted_id or "updated")

    def log_failure(self, filename: str, error: str):
        self.failed.update_one(
            {"original_filename": filename},
            {"$set": {
                "original_filename": filename,
                "error": error,
                "failed_at": datetime.utcnow(),
            }},
            upsert=True,
        )

    def already_exists(self, filename: str) -> bool:
        return bool(self.laws.count_documents({"original_filename": filename}, limit=1))

    def create_indexes(self):
        self.laws.create_index([("title",        ASCENDING)])
        self.laws.create_index([("year",         ASCENDING)])
        self.laws.create_index([("doc_type",     ASCENDING)])
        self.laws.create_index([("jurisdiction", ASCENDING)])
        self.laws.create_index([("act_number",   ASCENDING)])
        self.laws.create_index(
            [
                ("title",     TEXT),
                ("preamble",  TEXT),
                ("body_text", TEXT),
                ("full_text", TEXT),
            ],
            name="full_text_search",
            weights={"title": 10, "preamble": 5, "body_text": 2, "full_text": 1},
        )
        print("  ✓ MongoDB indexes created / verified.")

    def close(self):
        self.client.close()


# ══════════════════════════════════════════════════════════════════════════════
#  SECTION 5 — Input Source Iterators (unchanged)
# ══════════════════════════════════════════════════════════════════════════════

def _wrap(iterable, desc: str):
    lst = list(iterable)
    return tqdm(lst, desc=desc) if _TQDM else lst


def iter_from_zip(zip_path: str) -> Generator[tuple[str, bytes], None, None]:
    with zipfile.ZipFile(zip_path, "r") as zf:
        entries = [
            info for info in zf.infolist()
            if not info.is_dir() and info.filename.lower().endswith(".pdf")
        ]
    print(f"  Found {len(entries)} PDF(s) in ZIP archive.")
    with zipfile.ZipFile(zip_path, "r") as zf:
        for info in _wrap(entries, "Extracting from ZIP"):
            try:
                yield info.filename, zf.read(info.filename)
            except Exception as exc:
                print(f"  [WARN] Cannot read {info.filename}: {exc}")


def iter_from_files(paths: list[str]) -> Generator[tuple[str, bytes], None, None]:
    valid = [p for p in paths if p.lower().endswith(".pdf") and os.path.isfile(p)]
    print(f"  Processing {len(valid)} PDF file(s).")
    for path in _wrap(valid, "Reading PDFs"):
        try:
            with open(path, "rb") as fh:
                yield os.path.basename(path), fh.read()
        except Exception as exc:
            print(f"  [WARN] Cannot read {path}: {exc}")


def iter_from_directory(dir_path: str) -> Generator[tuple[str, bytes], None, None]:
    root = Path(dir_path)
    pdf_paths = sorted(root.rglob("*.pdf"))
    print(f"  Found {len(pdf_paths)} PDF(s) in directory.")
    for path in _wrap(pdf_paths, "Reading directory"):
        try:
            with open(path, "rb") as fh:
                yield str(path.relative_to(root)), fh.read()
        except Exception as exc:
            print(f"  [WARN] Cannot read {path}: {exc}")


# ══════════════════════════════════════════════════════════════════════════════
#  SECTION 6 — Core Processing Pipeline (unchanged)
# ══════════════════════════════════════════════════════════════════════════════

def process_source(
    source_iter: Generator[tuple[str, bytes], None, None],
    db: LawDB,
    skip_existing: bool = True,
    verbose: bool = False,
) -> dict:
    summary = {"total": 0, "success": 0, "skipped": 0, "failed": 0}

    for filename, pdf_bytes in source_iter:
        summary["total"] += 1

        if skip_existing and db.already_exists(filename):
            summary["skipped"] += 1
            if verbose:
                print(f"  [SKIP] {filename}")
            continue

        text = extract_text_from_bytes(pdf_bytes)
        if not text.strip():
            msg = "No extractable text (possibly scanned / image-only PDF)"
            print(f"  [WARN] {Path(filename).name}: {msg}")
            db.log_failure(filename, msg)
            summary["failed"] += 1
            continue

        try:
            fn_meta  = parse_filename(filename)
            document = parse_law_document(text, fn_meta)
        except Exception as exc:
            print(f"  [ERROR] Parsing {filename}: {exc}")
            db.log_failure(filename, str(exc))
            summary["failed"] += 1
            continue

        try:
            db.upsert(document)
            summary["success"] += 1
            if verbose:
                print(f"  [OK] {Path(filename).name}")
                print(f"       title        : {document['title']}")
                print(f"       year         : {document['year']}")
                print(f"       jurisdiction : {document['jurisdiction']}")
                print(f"       chapters     : {document['chapter_count']}  "
                      f"sections: {document['section_count']}")
        except Exception as exc:
            print(f"  [ERROR] Storing {filename}: {exc}")
            db.log_failure(filename, str(exc))
            summary["failed"] += 1

    return summary


# ══════════════════════════════════════════════════════════════════════════════
#  SECTION 7 — CLI (unchanged)
# ══════════════════════════════════════════════════════════════════════════════

def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        description="Extract Pakistani law PDFs and store structured metadata in MongoDB.",
        formatter_class=argparse.RawTextHelpFormatter,
    )
    src = p.add_mutually_exclusive_group(required=True)
    src.add_argument("--zip",  metavar="PATH", help="ZIP archive containing PDFs.")
    src.add_argument("--pdfs", nargs="+", metavar="FILE", help="Individual PDF files.")
    src.add_argument("--dir",  metavar="PATH", help="Directory to scan for PDFs.")
    p.add_argument("--mongo",        default="mongodb://localhost:27017/", metavar="URI")
    p.add_argument("--db",           default="LegisCounsel", metavar="NAME")
    p.add_argument("--no-skip",      action="store_true")
    p.add_argument("--verbose", "-v", action="store_true")
    p.add_argument("--no-index",     action="store_true")
    return p


def main():
    args = build_parser().parse_args()

    if args.zip and not os.path.isfile(args.zip):
        sys.exit(f"[ERROR] ZIP file not found: {args.zip}")
    if args.dir and not os.path.isdir(args.dir):
        sys.exit(f"[ERROR] Directory not found: {args.dir}")

    try:
        db = LawDB(args.mongo, args.db)
        print(f"  ✓ Connected to MongoDB ({args.db})")
    except Exception as exc:
        sys.exit(f"[ERROR] Cannot connect to MongoDB: {exc}")

    if not args.no_index:
        db.create_indexes()

    if args.zip:
        source = iter_from_zip(args.zip)
    elif args.pdfs:
        source = iter_from_files(args.pdfs)
    else:
        source = iter_from_directory(args.dir)

    summary = process_source(
        source_iter=source,
        db=db,
        skip_existing=not args.no_skip,
        verbose=args.verbose,
    )

    print(f"\n  Total: {summary['total']}  Success: {summary['success']}  "
          f"Skipped: {summary['skipped']}  Failed: {summary['failed']}")
    db.close()


if __name__ == "__main__":
    main()