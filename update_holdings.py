#!/usr/bin/env python3
"""CLI to replace holdings for a broker from a CSV file.

Usage:
    python update_holdings.py --broker Zerodha --file holdings.csv --date 2026-09-30
"""

import argparse
import sys
from datetime import date
from pathlib import Path

# Allow running from repo root
sys.path.insert(0, str(Path(__file__).resolve().parent))

from db import get_connection, init_db, replace_holdings_for_broker
from parsers.zerodha import ZerodhaParser

PARSERS = {
    "Zerodha": ZerodhaParser,
}


def main() -> None:
    parser = argparse.ArgumentParser(description="Replace broker holdings in portfolio DB")
    parser.add_argument("--broker", required=True, help="Broker name (e.g. Zerodha)")
    parser.add_argument("--file", required=True, help="Path to holdings CSV")
    parser.add_argument(
        "--date",
        help="Snapshot date (YYYY-MM-DD). Defaults to today.",
    )
    args = parser.parse_args()

    csv_path = Path(args.file)
    if not csv_path.exists():
        print(f"File not found: {csv_path}", file=sys.stderr)
        sys.exit(1)

    snapshot_date = args.date or date.today().isoformat()

    parser_cls = PARSERS.get(args.broker)
    if not parser_cls:
        print(f"Unsupported broker: {args.broker}. Available: {list(PARSERS)}", file=sys.stderr)
        sys.exit(1)

    broker_parser = parser_cls()
    rows = broker_parser.parse(csv_path)

    conn = get_connection()
    init_db(conn)
    snapshot_id = replace_holdings_for_broker(
        conn,
        broker_name=broker_parser.get_broker_name(),
        snapshot_date=snapshot_date,
        source_file=str(csv_path),
        rows=rows,
    )
    conn.close()

    print(f"Snapshot {snapshot_id} created for {broker_parser.get_broker_name()} on {snapshot_date}")
    print(f"Rows replaced: {len(rows)}")


if __name__ == "__main__":
    main()