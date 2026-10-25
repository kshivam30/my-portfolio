"""Zerodha holdings CSV parser."""

from pathlib import Path

from .base import BaseParser, clean_number, classify_asset_class


class ZerodhaParser(BaseParser):
    def get_broker_name(self) -> str:
        return "Zerodha"

    def parse(self, file_path: Path) -> list[dict]:
        import csv

        rows = []
        with open(file_path, newline="", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                instrument = (row.get("Instrument") or "").strip()
                if not instrument:
                    continue
                rows.append(
                    {
                        "instrument": instrument,
                        "asset_class": classify_asset_class(instrument),
                        "qty": clean_number(row.get("Qty.")),
                        "avg_cost": clean_number(row.get("Avg. cost")),
                        "ltp": clean_number(row.get("LTP")),
                        "invested": clean_number(row.get("Invested")),
                        "cur_val": clean_number(row.get("Cur. val")),
                        "pnl": clean_number(row.get("P&L")),
                        "net_chg_pct": clean_number(row.get("Net chg.")),
                        "day_chg_pct": clean_number(row.get("Day chg.")),
                    }
                )
        return rows