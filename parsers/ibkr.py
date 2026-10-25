"""Parser for the Open Positions section in an IBKR Activity Statement CSV.

YTD trades are deliberately ignored: the end-of-period Open Positions summary
is authoritative and is imported as a complete snapshot on every upload.
"""

from __future__ import annotations

import csv
import re
from datetime import datetime
from pathlib import Path

from .base import BaseParser, clean_number


class IbkrParser(BaseParser):
    currency = "USD"

    def __init__(self):
        self.account_id = None
        self.snapshot_date = None

    def get_broker_name(self) -> str:
        return f"IBKR ({self.account_id})" if self.account_id else "IBKR"

    def parse(self, file_path: Path) -> list[dict]:
        with open(file_path, newline="", encoding="utf-8-sig") as handle:
            rows = list(csv.reader(handle))

        metadata = {}
        section_rows = {}
        for row in rows:
            if len(row) < 2:
                continue
            section, row_type = row[0].strip(), row[1].strip()
            if row_type == "Data":
                section_rows.setdefault(section, []).append(row)
                if section in {"Statement", "Account Information"} and len(row) >= 4:
                    metadata[row[2].strip()] = row[3].strip()

        self.account_id = metadata.get("Account")
        if not self.account_id:
            raise ValueError("IBKR statement is missing its account identifier")
        if metadata.get("Base Currency") != self.currency:
            raise ValueError("Only USD base-currency IBKR statements are supported")

        period = metadata.get("Period", "")
        dates = re.findall(r"[A-Za-z]+\s+\d{1,2},\s+\d{4}", period)
        if len(dates) != 2:
            raise ValueError("Could not read the IBKR statement period")
        self.snapshot_date = datetime.strptime(dates[-1], "%B %d, %Y").date().isoformat()

        nav = self._nav(section_rows.get("Net Asset Value", []))
        positions = self._positions(rows)
        if positions is None:
            raise ValueError("IBKR statement has no supported Open Positions summary")

        cash_rows = [r for r in section_rows.get("Cash Report", []) if len(r) > 4 and r[2].strip() == "Ending Cash" and r[3].strip() == "Base Currency Summary"]
        if len(cash_rows) != 1:
            raise ValueError("Could not identify one base-currency ending cash balance")
        cash = clean_number(cash_rows[0][4])
        if cash is None:
            raise ValueError("IBKR ending cash is not numeric")

        stock_value = sum(r["cur_val"] or 0 for r in positions)
        if abs(stock_value - nav["Stock"]) > 0.02:
            raise ValueError("Parsed positions do not reconcile to IBKR's stock NAV; no data was imported")
        if abs(cash - nav["Cash"]) > 0.02:
            raise ValueError("Parsed cash does not reconcile to IBKR's cash NAV; no data was imported")

        positions.append({
            "instrument": "Cash (USD)",
            "asset_class": "Cash",
            "qty": 1,
            "avg_cost": 1,
            "ltp": 1,
            "invested": cash,
            "cur_val": cash,
            "pnl": 0,
            "net_chg_pct": 0,
            "day_chg_pct": None,
        })
        return positions

    def _nav(self, rows):
        result = {}
        for row in rows:
            if len(row) >= 7 and row[2].strip() in {"Cash", "Stock", "Total"}:
                value = clean_number(row[6])
                if value is not None:
                    result[row[2].strip()] = value
        if "Cash" not in result or "Stock" not in result or "Total" not in result:
            raise ValueError("IBKR statement is missing current Cash/Stock NAV totals")
        if abs(result["Cash"] + result["Stock"] - result["Total"]) > 0.02:
            raise ValueError("IBKR cash and stock NAV do not reconcile to total NAV")
        return result

    def _positions(self, rows):
        header = None
        positions = []
        lots = {}
        found_section = False
        for row in rows:
            if not row or row[0].strip() != "Open Positions":
                continue
            if row[1].strip() == "Header":
                header = {name.strip(): i for i, name in enumerate(row)}
                found_section = True
            elif row[1].strip() == "Data" and header:
                record = {name: row[i] if i < len(row) else "" for name, i in header.items()}
                if record.get("DataDiscriminator", "").strip() == "Lot":
                    symbol = record.get("Symbol", "").strip()
                    code = record.get("Code", "")
                    lots.setdefault(symbol, []).append("Un" in code.split(";"))
                    continue
                if record.get("DataDiscriminator", "").strip() != "Summary":
                    continue
                if record.get("Asset Category", "").strip() != "Stocks":
                    raise ValueError("IBKR statement includes an unsupported position type")
                if record.get("Currency", "").strip() != self.currency:
                    raise ValueError("IBKR positions must use the USD base currency")
                symbol = record.get("Symbol", "").strip()
                qty = clean_number(record.get("Quantity"))
                basis = clean_number(record.get("Cost Basis"))
                value = clean_number(record.get("Value"))
                cost_price = clean_number(record.get("Cost Price"))
                close_price = clean_number(record.get("Close Price"))
                pnl = clean_number(record.get("Unrealized P/L"))
                if not symbol or None in (qty, basis, value, cost_price, close_price, pnl):
                    raise ValueError("IBKR Open Positions row is incomplete")
                if qty < 0:
                    raise ValueError(f"Short positions are not supported ({symbol})")
                if abs(basis + pnl - value) > 0.03:
                    raise ValueError(f"IBKR cost basis and unrealized P/L do not reconcile for {symbol}")
                if any(p["instrument"] == symbol for p in positions):
                    raise ValueError(f"Duplicate position summary for {symbol}")
                positions.append({
                    "instrument": symbol,
                    "asset_class": "Equity",
                    "qty": qty,
                    "avg_cost": cost_price,
                    "ltp": close_price,
                    "invested": basis,
                    "cur_val": value,
                    "pnl": pnl,
                    "net_chg_pct": pnl / basis * 100 if basis else 0,
                    "day_chg_pct": None,
                })

        if not found_section:
            return None
        if len(positions) != len(set(p["instrument"] for p in positions)):
            raise ValueError("IBKR positions contain duplicate symbols")
        for position in positions:
            symbol_lots = lots.get(position["instrument"], [])
            if symbol_lots and all(symbol_lots):
                position["instrument"] += " (unvested award)"
                position["asset_class"] = "Equity award"
            elif any(symbol_lots):
                raise ValueError(
                    f"{position['instrument']} mixes vested and unvested lots; this statement cannot safely separate them"
                )
        return positions
