"""Tests for Zerodha parser and DB replace logic using dummy data only."""

import os
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from parsers.zerodha import ZerodhaParser
from db import (
    get_connection,
    init_db,
    replace_holdings_for_broker,
    get_latest_snapshot,
    get_holdings_for_snapshot,
)

DUMMY_CSV = Path(__file__).resolve().parent / "dummy_zerodha.csv"


class TestZerodhaParser(unittest.TestCase):
    def test_parse_dummy_csv(self):
        parser = ZerodhaParser()
        self.assertEqual(parser.get_broker_name(), "Zerodha")
        rows = parser.parse(DUMMY_CSV)
        self.assertEqual(len(rows), 3)

        first = rows[0]
        self.assertEqual(first["instrument"], "DUMMYSTOCK")
        self.assertEqual(first["asset_class"], "Equity")
        self.assertEqual(first["qty"], 10.0)
        self.assertEqual(first["invested"], 1000.0)
        self.assertEqual(first["pnl"], 100.0)

        second = rows[1]
        self.assertEqual(second["instrument"], "DUMMYFUND")
        self.assertEqual(second["asset_class"], "Mutual Fund")
        self.assertEqual(second["qty"], 5.5)

        third = rows[2]
        self.assertEqual(third["instrument"], "DUMMYETF")
        self.assertEqual(third["asset_class"], "Mutual Fund")


class TestDBReplaceLogic(unittest.TestCase):
    def setUp(self):
        # Use a temporary DB so tests never touch the real portfolio.db
        self.tmp_db = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
        self.tmp_db.close()
        self.conn = get_connection(Path(self.tmp_db.name))
        init_db(self.conn)

    def tearDown(self):
        self.conn.close()
        os.unlink(self.tmp_db.name)

    def test_replace_removes_older_holdings(self):
        parser = ZerodhaParser()
        rows_v1 = parser.parse(DUMMY_CSV)

        # First upload
        sid1 = replace_holdings_for_broker(
            self.conn,
            broker_name="Zerodha",
            snapshot_date="2026-01-01",
            source_file="v1.csv",
            rows=rows_v1,
        )
        snap1 = get_latest_snapshot(self.conn, "Zerodha")
        self.assertIsNotNone(snap1)
        self.assertEqual(len(get_holdings_for_snapshot(self.conn, sid1)), 3)

        # Second upload with different dummy data (simulating new monthly file)
        rows_v2 = [
            {
                "instrument": "NEWSTOCK",
                "asset_class": "Equity",
                "qty": 1.0,
                "avg_cost": 10.0,
                "ltp": 10.0,
                "invested": 10.0,
                "cur_val": 10.0,
                "pnl": 0.0,
                "net_chg_pct": 0.0,
                "day_chg_pct": 0.0,
            }
        ]
        sid2 = replace_holdings_for_broker(
            self.conn,
            broker_name="Zerodha",
            snapshot_date="2026-02-01",
            source_file="v2.csv",
            rows=rows_v2,
        )

        # Old snapshot should be gone; only latest remains
        latest = get_latest_snapshot(self.conn, "Zerodha")
        self.assertEqual(latest["id"], sid2)
        self.assertEqual(latest["snapshot_date"], "2026-02-01")

        holdings = get_holdings_for_snapshot(self.conn, sid2)
        self.assertEqual(len(holdings), 1)
        self.assertEqual(holdings[0]["instrument"], "NEWSTOCK")

        # Verify old snapshot id no longer has holdings
        old_holdings = get_holdings_for_snapshot(self.conn, sid1)
        self.assertEqual(len(old_holdings), 0)


if __name__ == "__main__":
    unittest.main()