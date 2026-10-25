import { useState, useEffect, useMemo } from "react";
import { getCumulative, getSnapshots } from "./api";
import { buildInsights } from "./lib/insights";
import PortfolioHero from "./components/PortfolioHero";
import AllocationPanel from "./components/AllocationPanel";
import InsightsPanel from "./components/InsightsPanel";
import BrokerSources from "./components/BrokerSources";
import HoldingsTable from "./components/HoldingsTable";
import UploadForm from "./components/UploadForm";
import EmptyState from "./components/EmptyState";
import Toast from "./components/Toast";
import EpfPage from "./components/EpfPage";
import IbkrPage from "./components/IbkrPage";
import Login from "./components/Login";
import { checkSession, getSession, signOut } from "./auth";

export default function App() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [snapshots, setSnapshots] = useState([]);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState("portfolio");
  const [epfRefreshKey, setEpfRefreshKey] = useState(0);
  const [ibkrRefreshKey, setIbkrRefreshKey] = useState(0);
  const [session, setSession] = useState(() => getSession());

  const insights = useMemo(() => buildInsights(data), [data]);

  useEffect(() => {
    let active = true;
    async function initialize() {
      const saved = getSession();
      if (saved?.guest) {
        if (active) setSession(saved);
        await loadInitial();
        return;
      }
      const validSession = await checkSession();
      if (!active) return;
      if (validSession) {
        setSession(validSession);
        await loadInitial();
      } else {
        signOut();
        setSession(null);
        setLoading(false);
      }
    }
    initialize();
    return () => { active = false; };
  }, []);

  async function handleSignedIn(nextSession) {
    setSession(nextSession);
    setLoading(true);
    setError(null);
    await loadInitial();
  }

  function handleSignOut() {
    signOut();
    setSession(null);
    setData(null);
    setSnapshots([]);
    setPage("portfolio");
  }

  const requestUpload = () => {
    if (session?.guest) {
      window.__addToast?.("Sign in to upload your own statements", "error");
      return;
    }
    setUploadOpen(true);
  };

  async function loadInitial() {
    try {
      const [cumulative, snaps] = await Promise.all([getCumulative(), getSnapshots()]);
      setData(cumulative);
      setSnapshots(snaps);
      setIbkrRefreshKey((key) => key + 1);
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function refresh() {
    setRefreshing(true);
    try {
      const [cumulative, snaps] = await Promise.all([getCumulative(), getSnapshots()]);
      setData(cumulative);
      setSnapshots(snaps);
      setIbkrRefreshKey((key) => key + 1);
      setError(null);
      window.__addToast?.("Portfolio refreshed", "success");
    } catch (e) {
      setError(e.message);
      window.__addToast?.(e.message || "Refresh failed", "error");
    } finally {
      setRefreshing(false);
    }
  }
  async function handleUpload() {
    const [updated, cumulative] = await Promise.all([getSnapshots(), getCumulative()]);
    setSnapshots(updated);
    setData(cumulative);
    setEpfRefreshKey((key) => key + 1);
    setIbkrRefreshKey((key) => key + 1);
    setUploadOpen(false);
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-9 h-9 border-2 border-ink-200 border-t-celadon-600 rounded-full animate-spin-slow" />
          <p className="text-sm text-ink-400">Loading portfolio…</p>
        </div>
      </div>
    );
  }

  if (!session) return <Login onSignedIn={handleSignedIn} />;

  return (
    <div className="min-h-screen text-ink-900 pb-16">
      <Toast />

      <header className="sticky top-0 z-40 border-b border-ink-100/70 bg-white/75 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-ink-900 text-white flex items-center justify-center font-display text-lg font-semibold shrink-0">
              A
            </div>
            <div className="min-w-0">
              <p className="font-display text-xl leading-none tracking-tight text-ink-950">Atlas</p>
              <p className="text-[11px] text-ink-400 truncate mt-0.5">Personal wealth ledger</p>
            </div>
          </div>

          <nav className="flex items-center gap-1 sm:gap-2" aria-label="Main navigation">
            {[{ label: "Portfolio", id: "portfolio" }, { label: "EPF", id: "epf" }, { label: "IBKR", id: "ibkr" }].map(({ label, id }) => <button key={id} type="button" onClick={() => setPage(id)} className={`rounded-lg px-3 py-2 text-sm font-medium transition ${page === id ? "bg-mist-100 text-ink-950" : "text-ink-500 hover:text-ink-900"}`}>{label}</button>)}
          </nav>
          <div className="flex items-center gap-2 sm:gap-3">
            <span className={`hidden md:inline rounded-full px-3 py-1 text-xs font-semibold ${session.guest ? "bg-celadon-50 text-celadon-700" : "bg-mist-100 text-ink-600"}`}>{session.guest ? "Guest · sample data" : session.username}</span>
            <button
              type="button"
              onClick={refresh}
              disabled={refreshing}
              className="hidden sm:inline-flex text-sm font-medium text-ink-500 hover:text-ink-900 transition px-3 py-2"
            >
              {refreshing ? "Refreshing…" : "Refresh"}
            </button>
            <button
              type="button"
              onClick={requestUpload}
              disabled={session.guest}
              title={session.guest ? "Uploads are available after signing in" : "Upload a statement"}
              className="inline-flex items-center gap-2 rounded-xl bg-ink-900 hover:bg-ink-800 text-white text-sm font-semibold px-3.5 sm:px-4 py-2.5 transition"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
              </svg>
              <span className="hidden xs:inline sm:inline">Upload</span>
            </button>
            <button type="button" onClick={handleSignOut} className="rounded-lg px-2 py-2 text-sm font-medium text-ink-500 hover:text-ink-900">Sign out</button>
          </div>
        </div>
      </header>

      {session.guest && <div className="border-b border-celadon-100 bg-celadon-50/80 px-4 py-2 text-center text-xs font-medium text-celadon-700">You’re exploring sample data. No real portfolio information is loaded in guest mode.</div>}

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 space-y-6">
        {page === "epf" ? <EpfPage onUpload={requestUpload} refreshKey={epfRefreshKey} /> : page === "ibkr" ? <IbkrPage refreshKey={ibkrRefreshKey} /> : <>
        {error && (
          <div className="rounded-2xl border border-coral-100 bg-coral-50 px-4 py-3 text-sm text-coral-700">
            {error}
          </div>
        )}

        {insights ? (
          <>
            <PortfolioHero insights={insights} />
            <AllocationPanel insights={insights} />
            <InsightsPanel insights={insights} />
            <BrokerSources brokers={insights.brokers} onUpload={() => setUploadOpen(true)} />
            <HoldingsTable holdings={insights.holdings} />
          </>
        ) : (
          <EmptyState onUpload={() => setUploadOpen(true)} />
        )}

        {snapshots.length > 0 && (
              <p className="text-center text-xs text-ink-300 pt-4">
              {session.guest ? "Fictional sample portfolio · native amounts by currency; totals in INR equivalent" : `${snapshots.length === 1 ? "1 snapshot" : `${snapshots.length} snapshots`} stored locally · native amounts by currency; portfolio totals in INR equivalent`}
          </p>
        )}
        </>}
      </main>

      <UploadForm
        isOpen={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onUpload={handleUpload}
      />
    </div>
  );
}
