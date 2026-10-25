"""FastAPI backend for portfolio tracker."""

import shutil
import sys
import tempfile
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi import Query

from db import (
    get_connection,
    init_db,
    replace_holdings_for_broker,
    get_latest_snapshot,
    get_holdings_for_snapshot,
    get_all_brokers,
    get_all_snapshots,
    upsert_epf_ledger,
    get_epf_summary,
    get_epf_ledger,
    get_fx_rate,
)
from parsers.zerodha import ZerodhaParser
from parsers.dhan import DhanParser
from parsers.epf import EpfParser
from parsers.ibkr import IbkrParser

PARSERS = {
    "Zerodha": ZerodhaParser,
    "Dhan": DhanParser,
    "EPF": EpfParser,
    "IBKR": IbkrParser,
}

app = FastAPI(title="Portfolio Tracker API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DB_PATH = Path(__file__).resolve().parents[1] / "portfolio.db"


def get_conn():
    conn = get_connection(DB_PATH)
    init_db(conn)
    return conn


@app.get("/api/brokers")
def list_brokers():
    conn = get_conn()
    try:
        brokers = get_all_brokers(conn)
        return [{"id": b["id"], "name": b["name"]} for b in brokers]
    finally:
        conn.close()


@app.get("/api/parsers")
def list_parsers():
    """Return available upload parsers (even if no data uploaded yet)."""
    return [
        {"name": "Zerodha", "parser": "Zerodha", "kind": "broker", "market": "india", "accept": ".csv"},
        {"name": "Dhan", "parser": "Dhan", "kind": "broker", "market": "india", "accept": ".csv"},
        {"name": "IBKR", "parser": "IBKR", "kind": "broker", "market": "us", "accept": ".csv"},
        {"name": "EPF", "parser": "EPF", "kind": "epf", "accept": ".pdf"},
    ]


@app.get("/api/snapshots")
def list_snapshots():
    conn = get_conn()
    try:
        snaps = get_all_snapshots(conn)
        return [
            {
                "id": s["id"],
                "broker": s["broker_name"],
                "snapshot_date": s["snapshot_date"],
                "source_file": s["source_file"],
                "currency": s["currency"],
                "total_invested": s["total_invested"],
                "total_cur_val": s["total_cur_val"],
                "total_pnl": s["total_pnl"],
                "created_at": s["created_at"],
            }
            for s in snaps
        ]
    finally:
        conn.close()


@app.get("/api/snapshots/latest")
def latest_snapshot(broker: str | None = None):
    conn = get_conn()
    try:
        if broker:
            snap = get_latest_snapshot(conn, broker)
            if not snap:
                raise HTTPException(status_code=404, detail="No snapshot for broker")
            holdings = get_holdings_for_snapshot(conn, snap["id"])
            return {
                "snapshot": {
                    "id": snap["id"],
                    "broker": snap["broker_name"],
                    "snapshot_date": snap["snapshot_date"],
                    "source_file": snap["source_file"],
                    "currency": snap["currency"],
                    "total_invested": snap["total_invested"],
                    "total_cur_val": snap["total_cur_val"],
                    "total_pnl": snap["total_pnl"],
                },
                "holdings": [
                    {
                        "id": h["id"],
                        "instrument": h["instrument"],
                        "asset_class": h["asset_class"],
                        "qty": h["qty"],
                        "avg_cost": h["avg_cost"],
                        "ltp": h["ltp"],
                        "invested": h["invested"],
                        "cur_val": h["cur_val"],
                        "pnl": h["pnl"],
                        "net_chg_pct": h["net_chg_pct"],
                        "day_chg_pct": h["day_chg_pct"],
                        "currency": snap["currency"] or "INR",
                    }
                    for h in holdings
                ],
            }
        snaps = get_all_snapshots(conn)
        latest_per_broker = {}
        for s in snaps:
            b = s["broker_name"]
            if b not in latest_per_broker or s["created_at"] > latest_per_broker[b]["created_at"]:
                latest_per_broker[b] = s

        result = []
        for b, snap in latest_per_broker.items():
            holdings = get_holdings_for_snapshot(conn, snap["id"])
            result.append({
                "snapshot": {
                    "id": snap["id"],
                    "broker": snap["broker_name"],
                    "snapshot_date": snap["snapshot_date"],
                    "source_file": snap["source_file"],
                    "currency": snap["currency"],
                    "total_invested": snap["total_invested"],
                    "total_cur_val": snap["total_cur_val"],
                    "total_pnl": snap["total_pnl"],
                },
                "holdings": [
                    {
                        "id": h["id"],
                        "instrument": h["instrument"],
                        "asset_class": h["asset_class"],
                        "qty": h["qty"],
                        "avg_cost": h["avg_cost"],
                        "ltp": h["ltp"],
                        "invested": h["invested"],
                        "cur_val": h["cur_val"],
                        "pnl": h["pnl"],
                        "net_chg_pct": h["net_chg_pct"],
                        "day_chg_pct": h["day_chg_pct"],
                        "currency": snap["currency"] or "INR",
                    }
                    for h in holdings
                ],
            })
        return result
    finally:
        conn.close()


@app.get("/api/cumulative/latest")
def cumulative_latest():
    """Return combined latest snapshot across ALL brokers + EPF."""
    conn = get_conn()
    try:
        snaps = get_all_snapshots(conn)
        latest_per_broker = {}
        for s in snaps:
            b = s["broker_name"]
            if b not in latest_per_broker or s["created_at"] > latest_per_broker[b]["created_at"]:
                latest_per_broker[b] = s

        epf = get_epf_summary(conn)
        fx = get_fx_rate(conn, "USD", "INR") if any((s["currency"] or "INR") == "USD" for s in latest_per_broker.values()) else None
        usd_inr = fx["rate"] if fx else None

        if not latest_per_broker and not epf:
            raise HTTPException(status_code=404, detail="No snapshots")

        total_invested = 0.0
        total_cur_val = 0.0
        total_pnl = 0.0
        currency_totals = {}
        all_holdings = []
        broker_summaries = []

        for b, snap in latest_per_broker.items():
            holdings = get_holdings_for_snapshot(conn, snap["id"])
            currency = snap["currency"] or "INR"
            totals = currency_totals.setdefault(currency, {"total_invested": 0.0, "total_cur_val": 0.0, "total_pnl": 0.0})
            totals["total_invested"] += snap["total_invested"] or 0
            totals["total_cur_val"] += snap["total_cur_val"] or 0
            totals["total_pnl"] += snap["total_pnl"] or 0
            if currency == "INR":
                total_invested += snap["total_invested"] or 0
                total_cur_val += snap["total_cur_val"] or 0
                total_pnl += snap["total_pnl"] or 0

            broker_summaries.append({
                "broker": snap["broker_name"],
                "snapshot_date": snap["snapshot_date"],
                "total_invested": snap["total_invested"],
                "total_cur_val": snap["total_cur_val"],
                "total_pnl": snap["total_pnl"],
                "kind": "broker",
                "currency": currency,
            })

            for h in holdings:
                all_holdings.append({
                    "id": h["id"],
                    "broker": snap["broker_name"],
                    "instrument": h["instrument"],
                    "asset_class": h["asset_class"],
                    "qty": h["qty"],
                    "avg_cost": h["avg_cost"],
                    "ltp": h["ltp"],
                    "invested": h["invested"],
                    "cur_val": h["cur_val"],
                    "pnl": h["pnl"],
                    "net_chg_pct": h["net_chg_pct"],
                    "day_chg_pct": h["day_chg_pct"],
                    "currency": currency,
                    "cur_val_inr": (h["cur_val"] or 0) * usd_inr if currency == "USD" and usd_inr else (h["cur_val"] if currency == "INR" else None),
                    "invested_inr": (h["invested"] or 0) * usd_inr if currency == "USD" and usd_inr else (h["invested"] if currency == "INR" else None),
                    "pnl_inr": (h["pnl"] or 0) * usd_inr if currency == "USD" and usd_inr else (h["pnl"] if currency == "INR" else None),
                })

        if epf:
            inr_totals = currency_totals.setdefault("INR", {"total_invested": 0.0, "total_cur_val": 0.0, "total_pnl": 0.0})
            inr_totals["total_invested"] += epf["total_invested"] or 0
            inr_totals["total_cur_val"] += epf["total_balance"] or 0
            inr_totals["total_pnl"] += epf["total_pnl"] or 0
            total_invested += epf["total_invested"] or 0
            total_cur_val += epf["total_balance"] or 0
            epf_pnl = epf["total_pnl"] or 0
            total_pnl += epf_pnl

            for acc in epf["accounts"]:
                broker_summaries.append({
                    "broker": "EPF",
                    "snapshot_date": min(acc.get("as_of"), date.today().isoformat()),
                    "total_invested": acc.get("invested"),
                    "total_cur_val": acc.get("balance"),
                    "total_pnl": acc.get("pnl") or 0,
                    "kind": "epf",
                    "currency": "INR",
                    "cur_val_inr": acc.get("balance"),
                    "invested_inr": acc.get("invested"),
                    "pnl_inr": acc.get("pnl") or 0,
                    "member_id": acc.get("member_id"),
                    "months": acc.get("months"),
                })
                all_holdings.append({
                    "id": f"epf-{acc['member_id']}",
                    "broker": "EPF",
                    "instrument": f"EPF · {acc['member_id'][-6:]}",
                   "asset_class": "EPF",
                    "qty": 1,
                    "avg_cost": acc.get("invested"),
                    "ltp": acc.get("balance"),
                    "invested": acc.get("invested"),
                    "cur_val": acc.get("balance"),
                    "pnl": acc.get("pnl") or 0,
                    "net_chg_pct": ((acc.get("pnl") or 0) / acc["invested"] * 100)
                        if acc.get("invested") else 0,
                    "day_chg_pct": None,
                    "currency": "INR",
                    "cur_val_inr": acc.get("balance"),
                    "invested_inr": acc.get("invested"),
                    "pnl_inr": acc.get("pnl") or 0,
                })

        if usd_inr and "USD" in currency_totals:
            usd_totals = currency_totals["USD"]
            usd_totals["fx_rate"] = usd_inr
            usd_totals["fx_date"] = fx["rate_date"]
            usd_totals["total_cur_val_inr"] = usd_totals["total_cur_val"] * usd_inr
            usd_totals["total_invested_inr"] = usd_totals["total_invested"] * usd_inr
            usd_totals["total_pnl_inr"] = usd_totals["total_pnl"] * usd_inr
            total_invested += usd_totals["total_invested_inr"]
            total_cur_val += usd_totals["total_cur_val_inr"]
            total_pnl += usd_totals["total_pnl_inr"]

        return {
            "total_invested": total_invested,
            "total_cur_val": total_cur_val,
            "total_pnl": total_pnl,
            "currency_totals": currency_totals,
            "fx": fx,
            "brokers": broker_summaries,
            "holdings": all_holdings,
            "epf": epf,
        }
    finally:
        conn.close()


@app.get("/api/ibkr")
def ibkr_overview():
    conn = get_conn()
    try:
        snapshots = [s for s in get_all_snapshots(conn) if s["broker_name"].startswith("IBKR (")]
        if not snapshots:
            raise HTTPException(status_code=404, detail="No IBKR snapshot")
        snap = max(snapshots, key=lambda s: (s["created_at"], s["id"]))
        fx = get_fx_rate(conn, "USD", "INR")
        holdings = []
        for h in get_holdings_for_snapshot(conn, snap["id"]):
            row = dict(h)
            row["currency"] = snap["currency"] or "USD"
            row["cur_val_inr"] = row["cur_val"] * fx["rate"] if fx else None
            holdings.append(row)
        return {
            "snapshot": dict(snap),
            "fx": fx,
            "holdings": holdings,
            "totals": {
                "total_invested": snap["total_invested"],
                "total_cur_val": snap["total_cur_val"],
                "total_pnl": snap["total_pnl"],
                "total_cur_val_inr": snap["total_cur_val"] * fx["rate"] if fx else None,
            },
        }
    finally:
        conn.close()


@app.get("/api/epf")
def epf_overview():
    conn = get_conn()
    try:
        summary = get_epf_summary(conn)
        if not summary or not summary["accounts"]:
            raise HTTPException(status_code=404, detail="No EPF data")
        return {
            "summary": summary,
            "ledger": [
                {
                    "id": r["id"],
                    "member_id": r["member_id"],
                    "financial_year": r["financial_year"],
                    "entry_kind": r["entry_kind"],
                    "natural_key": r["natural_key"],
                    "wage_month": r["wage_month"],
                    "due_month": r["due_month"],
                    "txn_date": r["txn_date"],
                    "txn_type": r["txn_type"],
                    "particulars": r["particulars"],
                    "wages_epf": r["wages_epf"],
                    "wages_eps": r["wages_eps"],
                    "employee": r["employee"],
                    "employer": r["employer"],
                    "pension": r["pension"],
                    "source_file": r["source_file"],
                    "updated_at": r["updated_at"],
                }
                for r in get_epf_ledger(conn)
            ],
        }
    finally:
        conn.close()


@app.get("/api/epf/ledger")
def epf_ledger(member_id: str | None = Query(default=None)):
    conn = get_conn()
    try:
        ledger = get_epf_ledger(conn, member_id)
        return {"ledger": [dict(r) for r in ledger]}
    finally:
        conn.close()


@app.get("/api/epf/summary")
def epf_summary():
    conn = get_conn()
    try:
        summary = get_epf_summary(conn)
        if not summary or not summary["accounts"]:
            raise HTTPException(status_code=404, detail="No EPF data")
        return summary
    finally:
        conn.close()


@app.get("/api/epf/latest")
def epf_latest():
    conn = get_conn()
    try:
        summary = get_epf_summary(conn)
        if not summary or not summary["accounts"]:
            raise HTTPException(status_code=404, detail="No EPF data")
        return {
            "summary": summary,
            "ledger": [dict(r) for r in get_epf_ledger(conn)],
        }
    finally:
        conn.close()


@app.post("/api/upload")
async def upload_holdings(
    broker: str = Form(...),
    snapshot_date: str = Form(...),
    file: UploadFile = File(...),
):
    """Upload broker CSV or EPF passbook PDF.

    Brokers: replace-all for that broker.
    EPF: upsert by natural_key (merge-safe, no duplicates).
    """
    suffix = Path(file.filename).suffix if file.filename else ""
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix or ".bin") as tmp:
        shutil.copyfileobj(file.file, tmp)
        tmp_path = Path(tmp.name)

    try:
        if broker == "EPF":
            try:
                rows = EpfParser().parse(tmp_path)
            except Exception as e:
                raise HTTPException(status_code=400, detail=f"EPF parse failed: {e}") from e

            conn = get_conn()
            try:
                result = upsert_epf_ledger(
                    conn,
                    rows=rows,
                    source_file=file.filename or "epf_passbook.pdf",
                )
            finally:
                conn.close()

            return {
                "kind": "epf",
                "broker": "EPF",
                "member_id": result["member_id"],
                "rows_parsed": len(rows),
                "inserted": result["inserted"],
                "updated": result["updated"],
                "total_rows": result["total_rows"],
                "snapshot_date": snapshot_date,
            }

        parser_cls = PARSERS.get(broker)
        if not parser_cls:
            raise HTTPException(status_code=400, detail=f"Unsupported broker: {broker}")

        parser = parser_cls()
        try:
            rows = parser.parse(tmp_path)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"{broker} parse failed: {e}") from e
        effective_snapshot_date = getattr(parser, "snapshot_date", None) or snapshot_date
        currency = getattr(parser, "currency", "INR")

        conn = get_conn()
        try:
            snapshot_id = replace_holdings_for_broker(
                conn,
                broker_name=parser.get_broker_name(),
                snapshot_date=effective_snapshot_date,
                source_file=file.filename or "uploaded.csv",
                rows=rows,
                currency=currency,
            )
        finally:
            conn.close()

        return {
            "kind": "broker",
            "snapshot_id": snapshot_id,
            "broker": parser.get_broker_name(),
            "snapshot_date": effective_snapshot_date,
            "currency": currency,
            "rows_replaced": len(rows),
        }
    finally:
        tmp_path.unlink(missing_ok=True)


@app.get("/api/health")
def health():
    return {"status": "ok"}
