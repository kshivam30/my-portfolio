"""Tests for EPF passbook parser and duplicate-safe upsert merge."""

import tempfile
import unittest
from pathlib import Path

import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from parsers.epf import EpfParser
from db import (
    get_connection,
    init_db,
    upsert_epf_ledger,
    get_epf_ledger,
    get_epf_summary,
)

FIXTURE = Path(__file__).resolve().parent / "fixtures" / "epf_passbook_fy2025.pdf"


class TestEpfParser(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if not FIXTURE.exists():
            raise unittest.SkipTest(f"Missing fixture {FIXTURE}")

    def test_parse_passbook(self):
        rows = EpfParser().parse(FIXTURE)
        kinds = {r["entry_kind"] for r in rows}
        self.assertIn("opening", kinds)
        self.assertIn("contribution", kinds)
        self.assertIn("interest", kinds)
        self.assertIn("closing", kinds)

        contribs = [r for r in rows if r["entry_kind"] == "contribution"]
        self.assertEqual(len(contribs), 12)
        self.assertTrue(rows[0]["member_id"])

        keys = [r["natural_key"] for r in rows]
        self.assertEqual(len(keys), len(set(keys)), "natural keys must be unique in one PDF")

        mar = next(r for r in contribs if r["due_month"] == "202504")
        self.assertEqual(mar["wage_month"], "2025-03")
        self.assertIsNotNone(mar["employee"])
        self.assertIsNotNone(mar["employer"])
        self.assertIsNotNone(mar["wages_epf"])

        closing = next(r for r in rows if r["entry_kind"] == "closing")
        self.assertIsNotNone(closing["employee"])
        self.assertTrue(closing["natural_key"].startswith("closing:"))


class TestEpfUpsertDedup(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if not FIXTURE.exists():
            raise unittest.SkipTest(f"Missing fixture {FIXTURE}")

    def setUp(self):
        self.tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
        self.tmp.close()
        self.conn = get_connection(Path(self.tmp.name))
        init_db(self.conn)
        self.rows = EpfParser().parse(FIXTURE)

    def tearDown(self):
        self.conn.close()
        Path(self.tmp.name).unlink(missing_ok=True)

    def test_same_pdf_twice_no_duplicates(self):
        first = upsert_epf_ledger(self.conn, self.rows, "passbook_a.pdf")
        second = upsert_epf_ledger(self.conn, self.rows, "passbook_a_again.pdf")

        self.assertEqual(first["inserted"], len(self.rows))
        self.assertEqual(first["updated"], 0)
        self.assertEqual(second["inserted"], 0)
        self.assertEqual(second["updated"], len(self.rows))
        self.assertEqual(first["total_rows"], second["total_rows"])

        ledger = get_epf_ledger(self.conn)
        keys = [r["natural_key"] for r in ledger]
        self.assertEqual(len(keys), len(set(keys)))

    def test_partial_then_full_merges(self):
        # Simulate mid-year PDF: opening + first 6 months only
        partial = [
            r
            for r in self.rows
            if r["entry_kind"] == "opening"
            or (r["entry_kind"] == "contribution" and r["due_month"] <= "202509")
        ]
        self.assertEqual(len([r for r in partial if r["entry_kind"] == "contribution"]), 6)

        first = upsert_epf_ledger(self.conn, partial, "half_year.pdf")
        self.assertEqual(first["inserted"], len(partial))

        # Full year upload later
        second = upsert_epf_ledger(self.conn, self.rows, "full_year.pdf")
        overlap = len(partial)
        new_rows = len(self.rows) - overlap
        self.assertEqual(second["updated"], overlap)
        self.assertEqual(second["inserted"], new_rows)
        self.assertEqual(second["total_rows"], len(self.rows))

        contribs = [
            r for r in get_epf_ledger(self.conn) if r["entry_kind"] == "contribution"
        ]
        self.assertEqual(len(contribs), 12)
        due_months = sorted(r["due_month"] for r in contribs)
        self.assertEqual(len(due_months), len(set(due_months)))

        summary = get_epf_summary(self.conn)
        self.assertGreater(summary["total_balance"], 0)
        self.assertEqual(summary["accounts"][0]["months"], 12)


if __name__ == "__main__":
    unittest.main()
