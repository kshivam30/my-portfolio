"""Dhan holdings CSV parser."""

import csv
from pathlib import Path

from .base import BaseParser, clean_number, classify_asset_class


class DhanParser(BaseParser):
    def get_broker_name(self) -> str:
        return "Dhan"

    def parse(self, file_path: Path) -> list[dict]:
        rows = []
        data_started = False

        with open(file_path, newline="", encoding="utf-8") as f:
            reader = csv.reader(f)
            for row in reader:
                if not row or all((cell or "").strip() == "" for cell in row):
                    continue

                first_cell = (row[0] or "").strip()

                # Skip summary / metadata rows
                if first_cell in ("EQ", "Name", "UCC", "Mobile", "Email ID"):
                    continue
                if first_cell.startswith("NOTE"):
                    continue
                if first_cell == "Investment":
                    continue

                # Detect column header row
                if first_cell == "Scrip Name":
                    data_started = True
                    continue

                if not data_started:
                    continue

                if len(row) < 8:
                    continue

                instrument = (row[0] or "").strip().strip('"')
                if not instrument:
                    continue

                rows.append({
                    "instrument": instrument,
                    "asset_class": classify_asset_class(instrument),
                    "qty": clean_number(row[1]),
                    "avg_cost": clean_number(row[2]),
                    "ltp": clean_number(row[4]),
                    "invested": clean_number(row[3]),
                    "cur_val": clean_number(row[5]),
                    "pnl": clean_number(row[6]),
                    "net_chg_pct": clean_number(row[7]),
                    "day_chg_pct": None,
                })

        return rows