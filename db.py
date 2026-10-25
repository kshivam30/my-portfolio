"""Database layer for portfolio tracker."""

import sqlite3
import json
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from urllib.request import Request, urlopen

DEFAULT_DB_PATH = Path(__file__).resolve().parent / "portfolio.db"


def get_connection(db_path: Path | None = None) -> sqlite3.Connection:
    path = db_path or DEFAULT_DB_PATH
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db(conn: sqlite3.Connection) -> None:
    # Check whether the new schema already exists; if not, rebuild from scratch.
    # This is a personal local tool, so dropping and recreating is acceptable.
    cur = conn.execute("SELECT name FROM sqlite_master WHERE type='table'")
    tables = {row["name"] for row in cur.fetchall()}

    needs_rebuild = False
    if "snapshots" in tables:
        cols = {row["name"] for row in conn.execute("PRAGMA table_info(snapshots)")}
        if "broker_id" not in cols:
            needs_rebuild = True

    if needs_rebuild:
        conn.executescript("DROP TABLE IF EXISTS holdings; DROP TABLE IF EXISTS snapshots; DROP TABLE IF EXISTS brokers;")

    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS brokers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL,
            created_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS snapshots (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            broker_id INTEGER NOT NULL,
            snapshot_date TEXT NOT NULL,
            source_file TEXT,
            currency TEXT NOT NULL DEFAULT 'INR',
            total_invested REAL DEFAULT 0,
            total_cur_val REAL DEFAULT 0,
            total_pnl REAL DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (broker_id) REFERENCES brokers(id)
        );

        CREATE TABLE IF NOT EXISTS holdings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            snapshot_id INTEGER NOT NULL,
            instrument TEXT NOT NULL,
            asset_class TEXT NOT NULL,
            qty REAL,
            avg_cost REAL,
            ltp REAL,
            invested REAL,
            cur_val REAL,
            pnl REAL,
            net_chg_pct REAL,
            day_chg_pct REAL,
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (snapshot_id) REFERENCES snapshots(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_holdings_snapshot ON holdings(snapshot_id);
        CREATE INDEX IF NOT EXISTS idx_holdings_instrument ON holdings(instrument);

        CREATE TABLE IF NOT EXISTS epf_accounts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            member_id TEXT UNIQUE NOT NULL,
            created_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS epf_ledger (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            account_id INTEGER NOT NULL,
            financial_year TEXT NOT NULL,
            entry_kind TEXT NOT NULL,
            natural_key TEXT NOT NULL,
            wage_month TEXT,
            due_month TEXT,
            txn_date TEXT,
            txn_type TEXT,
            particulars TEXT,
            wages_epf REAL,
            wages_eps REAL,
            employee REAL,
            employer REAL,
            pension REAL,
            source_file TEXT,
            updated_at TEXT DEFAULT (datetime('now')),
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (account_id) REFERENCES epf_accounts(id) ON DELETE CASCADE,
            UNIQUE (account_id, natural_key)
        );

        CREATE INDEX IF NOT EXISTS idx_epf_ledger_account ON epf_ledger(account_id);
        CREATE INDEX IF NOT EXISTS idx_epf_ledger_fy ON epf_ledger(financial_year);
        CREATE INDEX IF NOT EXISTS idx_epf_ledger_kind ON epf_ledger(entry_kind);

        CREATE TABLE IF NOT EXISTS fx_rates (
            base_currency TEXT NOT NULL,
            quote_currency TEXT NOT NULL,
            rate_date TEXT NOT NULL,
            rate REAL NOT NULL,
            source TEXT NOT NULL,
            fetched_at TEXT NOT NULL,
            PRIMARY KEY (base_currency, quote_currency)
        );
        """
    )
    snapshot_cols = {row["name"] for row in conn.execute("PRAGMA table_info(snapshots)")}
    if "currency" not in snapshot_cols:
        try:
            conn.execute("ALTER TABLE snapshots ADD COLUMN currency TEXT NOT NULL DEFAULT 'INR'")
        except sqlite3.OperationalError as exc:
            # Concurrent API requests may both observe the old schema. If the
            # other request wins the ALTER, the duplicate-column error is safe.
            if "duplicate column name: currency" not in str(exc).lower():
                raise
            current_cols = {row["name"] for row in conn.execute("PRAGMA table_info(snapshots)")}
            if "currency" not in current_cols:
                raise
    conn.commit()


def ensure_broker(conn: sqlite3.Connection, broker_name: str) -> int:
    cur = conn.execute("SELECT id FROM brokers WHERE name = ?", (broker_name,))
    row = cur.fetchone()
    if row:
        return row["id"]
    cur = conn.execute("INSERT INTO brokers (name) VALUES (?)", (broker_name,))
    conn.commit()
    return cur.lastrowid


def replace_holdings_for_broker(
    conn: sqlite3.Connection,
    broker_name: str,
    snapshot_date: str,
    source_file: str,
    rows: list[dict],
    currency: str = "INR",
) -> int:
    """Delete all existing data for a broker and insert the new snapshot + holdings.

    This implements the "remove older one" behavior: every upload replaces the
    previous holdings for that broker.
    """
    broker_id = ensure_broker(conn, broker_name)

    # Remove old snapshots and their holdings for this broker
    conn.execute(
        "DELETE FROM snapshots WHERE broker_id = ?", (broker_id,)
    )
    # holdings are cascade-deleted via FOREIGN KEY ON DELETE CASCADE

    total_invested = sum(r.get("invested") or 0 for r in rows)
    total_cur_val = sum(r.get("cur_val") or 0 for r in rows)
    total_pnl = sum(r.get("pnl") or 0 for r in rows)

    cur = conn.execute(
        """
        INSERT INTO snapshots
        (broker_id, snapshot_date, source_file, currency, total_invested, total_cur_val, total_pnl)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (broker_id, snapshot_date, source_file, currency, total_invested, total_cur_val, total_pnl),
    )
    snapshot_id = cur.lastrowid

    for r in rows:
        conn.execute(
            """
            INSERT INTO holdings
            (snapshot_id, instrument, asset_class, qty, avg_cost, ltp, invested, cur_val, pnl, net_chg_pct, day_chg_pct)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                snapshot_id,
                r["instrument"],
                r["asset_class"],
                r.get("qty"),
                r.get("avg_cost"),
                r.get("ltp"),
                r.get("invested"),
                r.get("cur_val"),
                r.get("pnl"),
                r.get("net_chg_pct"),
                r.get("day_chg_pct"),
            ),
        )

    conn.commit()
    return snapshot_id


def get_latest_snapshot(conn: sqlite3.Connection, broker_name: str) -> sqlite3.Row | None:
    cur = conn.execute(
        """
        SELECT s.*, b.name AS broker_name
        FROM snapshots s
        JOIN brokers b ON s.broker_id = b.id
        WHERE b.name = ?
        ORDER BY s.created_at DESC
        LIMIT 1
        """,
        (broker_name,),
    )
    return cur.fetchone()


def get_holdings_for_snapshot(
    conn: sqlite3.Connection, snapshot_id: int
) -> list[sqlite3.Row]:
    cur = conn.execute(
        """
        SELECT * FROM holdings WHERE snapshot_id = ?
        ORDER BY instrument
        """,
        (snapshot_id,),
    )
    return cur.fetchall()


def get_all_brokers(conn: sqlite3.Connection) -> list[sqlite3.Row]:
    cur = conn.execute("SELECT * FROM brokers ORDER BY name")
    return cur.fetchall()


def get_all_snapshots(conn: sqlite3.Connection) -> list[sqlite3.Row]:
    cur = conn.execute(
        """
        SELECT s.*, b.name AS broker_name
        FROM snapshots s
        JOIN brokers b ON s.broker_id = b.id
        ORDER BY s.created_at DESC
        """
    )
    return cur.fetchall()


def ensure_epf_account(conn: sqlite3.Connection, member_id: str) -> int:
    cur = conn.execute("SELECT id FROM epf_accounts WHERE member_id = ?", (member_id,))
    row = cur.fetchone()
    if row:
        return row["id"]
    cur = conn.execute("INSERT INTO epf_accounts (member_id) VALUES (?)", (member_id,))
    conn.commit()
    return cur.lastrowid


def upsert_epf_ledger(
    conn: sqlite3.Connection,
    rows: list[dict],
    source_file: str,
) -> dict:
    """Merge EPF ledger rows by natural key — never create duplicates.

    Same PDF twice → UPDATE existing rows (row count unchanged).
    Partial year then full year → UPDATE overlapping months, INSERT new months.
    """
    if not rows:
        raise ValueError("No EPF rows to upsert")

    member_id = rows[0]["member_id"]
    account_id = ensure_epf_account(conn, member_id)

    inserted = 0
    updated = 0

    for r in rows:
        existing = conn.execute(
            """
            SELECT id FROM epf_ledger
            WHERE account_id = ? AND natural_key = ?
            """,
            (account_id, r["natural_key"]),
        ).fetchone()

        params = (
            r["financial_year"],
            r["entry_kind"],
            r.get("wage_month"),
            r.get("due_month"),
            r.get("txn_date"),
            r.get("txn_type"),
            r.get("particulars"),
            r.get("wages_epf"),
            r.get("wages_eps"),
            r.get("employee"),
            r.get("employer"),
            r.get("pension"),
            source_file,
            account_id,
            r["natural_key"],
        )

        if existing:
            conn.execute(
                """
                UPDATE epf_ledger SET
                    financial_year = ?,
                    entry_kind = ?,
                    wage_month = ?,
                    due_month = ?,
                    txn_date = ?,
                    txn_type = ?,
                    particulars = ?,
                    wages_epf = ?,
                    wages_eps = ?,
                    employee = ?,
                    employer = ?,
                    pension = ?,
                    source_file = ?,
                    updated_at = datetime('now')
                WHERE account_id = ? AND natural_key = ?
                """,
                params,
            )
            updated += 1
        else:
            conn.execute(
                """
                INSERT INTO epf_ledger (
                    financial_year, entry_kind, wage_month, due_month, txn_date,
                    txn_type, particulars, wages_epf, wages_eps, employee, employer,
                    pension, source_file, account_id, natural_key
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                params,
            )
            inserted += 1

    conn.commit()
    total = conn.execute(
        "SELECT COUNT(*) AS c FROM epf_ledger WHERE account_id = ?",
        (account_id,),
    ).fetchone()["c"]

    return {
        "account_id": account_id,
        "member_id": member_id,
        "inserted": inserted,
        "updated": updated,
        "total_rows": total,
    }


def get_fx_rate(conn: sqlite3.Connection, base: str, quote: str) -> dict | None:
    """Get a daily reference FX rate, refreshing a local cache at most twice a day."""
    base, quote = base.upper(), quote.upper()
    row = conn.execute(
        "SELECT * FROM fx_rates WHERE base_currency = ? AND quote_currency = ?",
        (base, quote),
    ).fetchone()
    now = datetime.now(timezone.utc)

    def result(cached, stale=False):
        return {
            "base": cached["base_currency"],
            "quote": cached["quote_currency"],
            "rate": cached["rate"],
            "rate_date": cached["rate_date"],
            "source": cached["source"],
            "fetched_at": cached["fetched_at"],
            "stale": stale,
        }

    if row:
        fetched = datetime.fromisoformat(row["fetched_at"])
        if fetched.tzinfo is None:
            fetched = fetched.replace(tzinfo=timezone.utc)
        if now - fetched < timedelta(hours=12):
            return result(row)

    try:
        request = Request(
            f"https://api.frankfurter.dev/v2/rate/{base.lower()}/{quote.lower()}",
            headers={"User-Agent": "AtlasPortfolio/1.0"},
        )
        with urlopen(request, timeout=5) as response:
            payload = json.loads(response.read().decode("utf-8"))
        rate = float(payload["rate"])
        rate_date = str(payload["date"])
        if payload.get("base", base).upper() != base or payload.get("quote", quote).upper() != quote or rate <= 0:
            raise ValueError("Unexpected FX response")
        fetched_at = now.strftime("%Y-%m-%d %H:%M:%S")
        conn.execute(
            """INSERT INTO fx_rates (base_currency, quote_currency, rate_date, rate, source, fetched_at)
               VALUES (?, ?, ?, ?, ?, ?)
               ON CONFLICT(base_currency, quote_currency) DO UPDATE SET
                 rate_date=excluded.rate_date, rate=excluded.rate,
                 source=excluded.source, fetched_at=excluded.fetched_at""",
            (base, quote, rate_date, rate, "Frankfurter daily blended reference rate", fetched_at),
        )
        conn.commit()
        return result(conn.execute(
            "SELECT * FROM fx_rates WHERE base_currency = ? AND quote_currency = ?",
            (base, quote),
        ).fetchone())
    except Exception:
        return result(row, stale=True) if row else None


def get_epf_summary(conn: sqlite3.Connection) -> dict | None:
    """Latest EPF balance across accounts for portfolio net-worth."""
    accounts = conn.execute("SELECT * FROM epf_accounts ORDER BY member_id").fetchall()
    if not accounts:
        return None

    summaries = []
    total_balance = 0.0
    total_principal = 0.0
    total_true_pnl = 0.0

    for acc in accounts:
        today = date.today().isoformat()
        closing = conn.execute(
            """
            SELECT * FROM epf_ledger
            WHERE account_id = ? AND entry_kind = 'closing' AND txn_date <= ?
            ORDER BY txn_date DESC, id DESC
            LIMIT 1
            """,
            (acc["id"], today),
        ).fetchone()

        opening = conn.execute(
            """
            SELECT * FROM epf_ledger
            WHERE account_id = ? AND entry_kind = 'opening'
            ORDER BY txn_date DESC, id DESC
            LIMIT 1
            """,
            (acc["id"],),
        ).fetchone()

        contribs = conn.execute(
            """
            SELECT
                COALESCE(SUM(employee), 0) AS employee,
                COALESCE(SUM(employer), 0) AS employer,
                COALESCE(SUM(pension), 0) AS pension,
                COUNT(*) AS months
            FROM epf_ledger
            WHERE account_id = ? AND entry_kind = 'contribution' AND txn_date <= ?
            """,
            (acc["id"], today),
        ).fetchone()

        # A passbook may contain a future-dated year-end row even when only
        # current-month transactions have posted. Rebuild from the latest
        # non-future closing plus subsequent posted transactions.
        if closing:
            balance = sum(closing[k] or 0 for k in ("employee", "employer", "pension"))
            as_of = closing["txn_date"]
            later = conn.execute(
                """SELECT entry_kind, employee, employer, pension, txn_date
                   FROM epf_ledger WHERE account_id = ? AND txn_date > ? AND txn_date <= ?
                   AND entry_kind IN ('contribution','interest')""",
                (acc["id"], closing["txn_date"], today),
            ).fetchall()
            for entry in later:
                balance += sum(entry[k] or 0 for k in ("employee", "employer", "pension"))
                as_of = max(as_of, entry["txn_date"])
        else:
            ob = sum(opening[k] or 0 for k in ("employee", "employer", "pension")) if opening else 0.0
            valid_rows = conn.execute(
                """SELECT entry_kind, employee, employer, pension, txn_date
                   FROM epf_ledger WHERE account_id = ? AND txn_date <= ?
                   AND entry_kind IN ('contribution','interest')""", (acc["id"], today)
            ).fetchall()
            balance = ob + sum(sum(r[k] or 0 for k in ("employee", "employer", "pension")) for r in valid_rows)
            as_of = max((r["txn_date"] for r in valid_rows if r["txn_date"]), default=opening["txn_date"] if opening else None)

        # Opening balances roll forward across FYs, so count only the earliest
        # opening plus all unique monthly contributions as principal.
        first_opening = conn.execute(
            """SELECT employee, employer, pension FROM epf_ledger
               WHERE account_id = ? AND entry_kind = 'opening'
               ORDER BY txn_date, id LIMIT 1""", (acc["id"],)
        ).fetchone()
        opening_principal = sum(first_opening[k] or 0 for k in ("employee", "employer", "pension")) if first_opening else 0.0
        principal = opening_principal + sum(contribs[k] or 0 for k in ("employee", "employer", "pension"))
        invested = principal
        true_pnl = balance - principal

        total_balance += balance
        total_principal += invested
        total_true_pnl += true_pnl

        summaries.append(
            {
                "member_id": acc["member_id"],
                "balance": balance,
                "invested": invested,
                "pnl": true_pnl,
                "employee_contrib": contribs["employee"] or 0,
                "employer_contrib": contribs["employer"] or 0,
                "pension_contrib": contribs["pension"] or 0,
                "interest_earned": true_pnl,
                "months": contribs["months"] or 0,
                "as_of": as_of,
                "financial_year": closing["financial_year"] if closing else (opening["financial_year"] if opening else None),
            }
        )

    return {
        "total_balance": total_balance,
        "total_invested": total_principal,
        "total_pnl": total_true_pnl,
        "accounts": summaries,
    }


def get_all_epf_accounts(
    conn: sqlite3.Connection,
) -> list[sqlite3.Row]:
    """Return all EPF account records (member_id, created_at)."""
    conn.row_factory = sqlite3.Row
    cur = conn.execute("SELECT * FROM epf_accounts ORDER BY member_id")
    return cur.fetchall()



def get_epf_ledger(
    conn: sqlite3.Connection, member_id: str | None = None
) -> list[sqlite3.Row]:
    if member_id:
        return conn.execute(
            """
            SELECT l.*, a.member_id
            FROM epf_ledger l
            JOIN epf_accounts a ON a.id = l.account_id
            WHERE a.member_id = ?
            ORDER BY COALESCE(l.due_month, l.txn_date, ''), l.id
            """,
            (member_id,),
        ).fetchall()
    return conn.execute(
        """
        SELECT l.*, a.member_id
        FROM epf_ledger l
        JOIN epf_accounts a ON a.id = l.account_id
        ORDER BY a.member_id, COALESCE(l.due_month, l.txn_date, ''), l.id
        """
    ).fetchall()
