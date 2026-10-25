"""EPFO Member Passbook PDF parser.

Dedup model
-----------
Each ledger row gets a stable ``natural_key`` scoped to the member account:

- opening balance for a FY     → ``opening:{fy}``          e.g. opening:2025-2026
- monthly contribution         → ``contrib:{due_month}``   e.g. contrib:202504
- interest credit              → ``interest:{as_of}``      e.g. interest:2026-03-31
- closing balance              → ``closing:{as_of}``       e.g. closing:2026-03-31

Uploads UPSERT on ``(account_id, natural_key)``. Re-uploading the same PDF is a
no-op for row count. Uploading a mid-year passbook then a full-year passbook
merges: existing months update in place, new months insert, never duplicate.
"""

from __future__ import annotations

import re
from pathlib import Path

from .base import BaseParser, clean_number

MONTHS = {
    "jan": 1,
    "feb": 2,
    "mar": 3,
    "apr": 4,
    "may": 5,
    "jun": 6,
    "jul": 7,
    "aug": 8,
    "sep": 9,
    "oct": 10,
    "nov": 11,
    "dec": 12,
}

FY_RE = re.compile(
    r"Financial Year\s*[-–]\s*(\d{4})\s*[-–]\s*(\d{4})",
    re.IGNORECASE,
)
MEMBER_RE = re.compile(r"\b([A-Z]{5}\d{17})\b")
DATE_RE = re.compile(r"(\d{2})[/-](\d{2})[/-](\d{4})")
DUE_MONTH_RE = re.compile(r"Due-Month\s*(\d{6})", re.IGNORECASE)
WAGE_MONTH_RE = re.compile(
    r"^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)-(\d{4})$",
    re.IGNORECASE,
)


def _parse_inr(value) -> float | None:
    if value is None:
        return None
    text = str(value).strip().replace(",", "")
    if not text or text.lower() in {"none", "null", "-"}:
        return None
    return clean_number(text)


def _iso_date(text: str | None) -> str | None:
    if not text:
        return None
    m = DATE_RE.search(str(text))
    if not m:
        return None
    dd, mm, yyyy = m.groups()
    return f"{yyyy}-{mm}-{dd}"


def _normalize_wage_month(text: str | None) -> str | None:
    if not text:
        return None
    m = WAGE_MONTH_RE.match(str(text).strip())
    if not m:
        return None
    month = MONTHS[m.group(1).lower()]
    year = int(m.group(2))
    return f"{year:04d}-{month:02d}"


def _extract_text(path: Path) -> str:
    try:
        import pdfplumber

        chunks = []
        with pdfplumber.open(path) as pdf:
            for page in pdf.pages:
                chunks.append(page.extract_text() or "")
        return "\n".join(chunks)
    except Exception:
        from pypdf import PdfReader

        reader = PdfReader(str(path))
        return "\n".join((p.extract_text() or "") for p in reader.pages)


def _extract_tables(path: Path) -> list[list[list]]:
    import pdfplumber

    tables = []
    with pdfplumber.open(path) as pdf:
        for page in pdf.pages:
            for table in page.extract_tables() or []:
                tables.append(table)
    return tables


class EpfParser(BaseParser):
    def get_broker_name(self) -> str:
        return "EPF"

    def parse(self, file_path: Path) -> list[dict]:
        path = Path(file_path)
        text = _extract_text(path)
        tables = _extract_tables(path)

        member_id = self._find_member_id(text, path.name)
        fy = self._find_fy(text)
        if not fy:
            raise ValueError("Could not detect EPF financial year from PDF")

        rows: list[dict] = []
        for table in tables:
            rows.extend(self._parse_table(table, member_id=member_id, fy=fy))

        if not rows:
            rows = self._parse_text_fallback(text, member_id=member_id, fy=fy)

        if not rows:
            raise ValueError("No EPF ledger rows found in PDF")

        # Dedup within a single PDF as well (pdfplumber can repeat header noise)
        by_key: dict[str, dict] = {}
        for row in rows:
            by_key[row["natural_key"]] = row
        return list(by_key.values())

    def _find_member_id(self, text: str, filename: str) -> str:
        m = MEMBER_RE.search(text)
        if m:
            return m.group(1)
        stem = Path(filename).stem
        m = MEMBER_RE.search(stem)
        if m:
            return m.group(1)
        # Fallback: treat whole stem as account label (still unique per file naming)
        return stem.split("_")[0]

    def _find_fy(self, text: str) -> str | None:
        m = FY_RE.search(text)
        if m:
            return f"{m.group(1)}-{m.group(2)}"
        return None

    def _base_row(self, *, member_id: str, fy: str, kind: str, natural_key: str) -> dict:
        return {
            "member_id": member_id,
            "financial_year": fy,
            "entry_kind": kind,
            "natural_key": natural_key,
            "wage_month": None,
            "due_month": None,
            "txn_date": None,
            "txn_type": None,
            "particulars": None,
            "wages_epf": None,
            "wages_eps": None,
            "employee": None,
            "employer": None,
            "pension": None,
        }

    def _parse_table(self, table: list[list], *, member_id: str, fy: str) -> list[dict]:
        rows: list[dict] = []
        for raw in table:
            cells = [("" if c is None else str(c).replace("\n", " ").strip()) for c in raw]
            if not any(cells):
                continue
            label = cells[0]
            joined = " ".join(cells)

            if label.startswith("OB Int.") or "OB Int. Updated" in label:
                as_of = _iso_date(label) or f"{fy.split('-')[0]}-04-01"
                row = self._base_row(
                    member_id=member_id,
                    fy=fy,
                    kind="opening",
                    natural_key=f"opening:{fy}",
                )
                amounts = self._trailing_amounts(cells)
                row.update(
                    {
                        "txn_date": as_of,
                        "particulars": label,
                        "employee": amounts[0],
                        "employer": amounts[1],
                        "pension": amounts[2],
                    }
                )
                rows.append(row)
                continue

            if WAGE_MONTH_RE.match(label):
                due = None
                dm = DUE_MONTH_RE.search(joined)
                if dm:
                    due = dm.group(1)
                wage = _normalize_wage_month(label)
                if not due and wage:
                    # Cont. due-month is typically wage_month + 1 calendar month
                    y, m = map(int, wage.split("-"))
                    m += 1
                    if m == 13:
                        y, m = y + 1, 1
                    due = f"{y:04d}{m:02d}"
                if not due:
                    continue
                amounts = self._contribution_amounts(cells)
                row = self._base_row(
                    member_id=member_id,
                    fy=fy,
                    kind="contribution",
                    natural_key=f"contrib:{due}",
                )
                row.update(
                    {
                        "wage_month": wage,
                        "due_month": due,
                        "txn_date": _iso_date(cells[1] if len(cells) > 1 else None),
                        "txn_type": cells[2] if len(cells) > 2 else None,
                        "particulars": cells[3] if len(cells) > 3 else None,
                        "wages_epf": amounts["wages_epf"],
                        "wages_eps": amounts["wages_eps"],
                        "employee": amounts["employee"],
                        "employer": amounts["employer"],
                        "pension": amounts["pension"],
                    }
                )
                rows.append(row)
                continue

            if label.startswith("Int. Updated"):
                as_of = _iso_date(label)
                if not as_of:
                    continue
                amounts = self._trailing_amounts(cells)
                row = self._base_row(
                    member_id=member_id,
                    fy=fy,
                    kind="interest",
                    natural_key=f"interest:{as_of}",
                )
                row.update(
                    {
                        "txn_date": as_of,
                        "particulars": label,
                        "employee": amounts[0],
                        "employer": amounts[1],
                        "pension": amounts[2],
                    }
                )
                rows.append(row)
                continue

            if label.startswith("Closing Balance"):
                as_of = _iso_date(label)
                if not as_of:
                    continue
                amounts = self._trailing_amounts(cells)
                row = self._base_row(
                    member_id=member_id,
                    fy=fy,
                    kind="closing",
                    natural_key=f"closing:{as_of}",
                )
                row.update(
                    {
                        "txn_date": as_of,
                        "particulars": label,
                        "employee": amounts[0],
                        "employer": amounts[1],
                        "pension": amounts[2],
                    }
                )
                rows.append(row)
                continue

        return rows

    def _trailing_amounts(self, cells: list[str]) -> tuple[float | None, float | None, float | None]:
        nums = []
        for c in cells[1:]:
            n = _parse_inr(c)
            if n is not None:
                nums.append(n)
        while len(nums) < 3:
            nums.append(0.0)
        return nums[-3], nums[-2], nums[-1]

    def _contribution_amounts(self, cells: list[str]) -> dict:
        # Expected trailing numeric fields:
        # wages_epf, wages_eps, employee, employer, pension
        nums = []
        for c in cells[4:]:
            n = _parse_inr(c)
            if n is not None:
                nums.append(n)
        # Some extractions leave blanks — pad on the right
        while len(nums) < 5:
            nums.append(0.0)
        wages_epf, wages_eps, employee, employer, pension = nums[:5]
        return {
            "wages_epf": wages_epf,
            "wages_eps": wages_eps,
            "employee": employee,
            "employer": employer,
            "pension": pension,
        }

    def _parse_text_fallback(self, text: str, *, member_id: str, fy: str) -> list[dict]:
        """Line-oriented fallback when table extraction fails."""
        rows: list[dict] = []
        for line in text.splitlines():
            line = " ".join(line.split())
            if not line:
                continue

            if line.startswith("OB Int."):
                as_of = _iso_date(line) or f"{fy.split('-')[0]}-04-01"
                nums = [float(x.replace(",", "")) for x in re.findall(r"[\d,]+(?:\.\d+)?", line)]
                # last 3 numbers are balances; earlier may include date parts
                emp, emr, pen = (nums[-3], nums[-2], nums[-1]) if len(nums) >= 3 else (0, 0, 0)
                row = self._base_row(
                    member_id=member_id, fy=fy, kind="opening", natural_key=f"opening:{fy}"
                )
                row.update(
                    {
                        "txn_date": as_of,
                        "particulars": line,
                        "employee": emp,
                        "employer": emr,
                        "pension": pen,
                    }
                )
                rows.append(row)
                continue

            m = WAGE_MONTH_RE.match(line.split()[0]) if line.split() else None
            if m or WAGE_MONTH_RE.match(line[:8] if len(line) >= 8 else ""):
                wage_token = line.split()[0]
                if not WAGE_MONTH_RE.match(wage_token):
                    continue
                due_m = DUE_MONTH_RE.search(line)
                if not due_m:
                    continue
                due = due_m.group(1)
                # Numbers after particulars
                after = line[due_m.end() :]
                nums = [float(x.replace(",", "")) for x in re.findall(r"[\d,]+(?:\.\d+)?", after)]
                while len(nums) < 5:
                    nums.append(0.0)
                date_m = DATE_RE.search(line)
                row = self._base_row(
                    member_id=member_id,
                    fy=fy,
                    kind="contribution",
                    natural_key=f"contrib:{due}",
                )
                row.update(
                    {
                        "wage_month": _normalize_wage_month(wage_token),
                        "due_month": due,
                        "txn_date": _iso_date(date_m.group(0) if date_m else None),
                        "txn_type": "CR" if " CR " in f" {line} " else None,
                        "particulars": f"Cont. for the Due-Month{due}",
                        "wages_epf": nums[0],
                        "wages_eps": nums[1],
                        "employee": nums[2],
                        "employer": nums[3],
                        "pension": nums[4],
                    }
                )
                rows.append(row)
                continue

            if line.startswith("Int. Updated"):
                as_of = _iso_date(line)
                if not as_of:
                    continue
                nums = [float(x.replace(",", "")) for x in re.findall(r"[\d,]+(?:\.\d+)?", line)]
                emp, emr, pen = (nums[-3], nums[-2], nums[-1]) if len(nums) >= 3 else (0, 0, 0)
                row = self._base_row(
                    member_id=member_id, fy=fy, kind="interest", natural_key=f"interest:{as_of}"
                )
                row.update(
                    {
                        "txn_date": as_of,
                        "particulars": line,
                        "employee": emp,
                        "employer": emr,
                        "pension": pen,
                    }
                )
                rows.append(row)
                continue

            if line.startswith("Closing Balance"):
                as_of = _iso_date(line)
                if not as_of:
                    continue
                nums = [float(x.replace(",", "")) for x in re.findall(r"[\d,]+(?:\.\d+)?", line)]
                emp, emr, pen = (nums[-3], nums[-2], nums[-1]) if len(nums) >= 3 else (0, 0, 0)
                row = self._base_row(
                    member_id=member_id, fy=fy, kind="closing", natural_key=f"closing:{as_of}"
                )
                row.update(
                    {
                        "txn_date": as_of,
                        "particulars": line,
                        "employee": emp,
                        "employer": emr,
                        "pension": pen,
                    }
                )
                rows.append(row)

        return rows
