"""Base class for broker-specific CSV parsers."""

from abc import ABC, abstractmethod
from pathlib import Path


class BaseParser(ABC):
    @abstractmethod
    def get_broker_name(self) -> str:
        """Return the broker display name."""

    @abstractmethod
    def parse(self, file_path: Path) -> list[dict]:
        """Parse a holdings CSV and return a list of normalized row dicts.

        Each dict should contain keys:
            instrument, qty, avg_cost, ltp, invested, cur_val, pnl,
            net_chg_pct, day_chg_pct
        asset_class is added by the caller or inside parse().
        """


def clean_number(value):
    if value is None or str(value).strip() == "":
        return None
    try:
        return float(str(value).replace(",", "").strip())
    except ValueError:
        return None


def classify_asset_class(instrument: str) -> str:
    name = instrument.lower()
    keywords = ["fund", "etf", "bees", "index", "gold"]
    for kw in keywords:
        if kw in name:
            return "Mutual Fund"
    return "Equity"