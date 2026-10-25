import { useState } from "react";
import { signIn, signInAsGuest } from "../auth";

export default function Login({ onSignedIn }) {
  const [key, setKey] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(action) {
    setError("");
    setBusy(true);
    try { onSignedIn(await action()); }
    catch (e) { setError(e.message || "Sign in failed."); }
    finally { setBusy(false); }
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-12">
      <section className="w-full max-w-md rounded-[1.75rem] border border-ink-100 bg-white/85 p-7 sm:p-9 shadow-lift backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-ink-900 text-white flex items-center justify-center font-display text-xl">A</div>
          <div><p className="font-display text-xl text-ink-950">Atlas</p><p className="text-xs text-ink-400">Personal wealth ledger</p></div>
        </div>
        <p className="mt-9 text-xs font-semibold uppercase tracking-[0.18em] text-celadon-700">Private portfolio</p>
        <h1 className="mt-2 font-display text-3xl text-ink-950">Welcome back</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-500">Sign in to open your portfolio, or explore Atlas with a separate sample account.</p>

        <form className="mt-7 space-y-4" onSubmit={(event) => { event.preventDefault(); submit(() => signIn(key)); }}>
          <label className="block text-sm font-medium text-ink-700">Access key
            <input autoComplete="current-password" required type="password" value={key} onChange={(e) => setKey(e.target.value)} className="mt-1.5 w-full rounded-xl border border-ink-200 bg-white px-3.5 py-3 outline-none focus:border-celadon-500 focus:ring-2 focus:ring-celadon-100" placeholder="Enter your access key" />
          </label>
          {error && <p role="alert" className="rounded-xl border border-coral-100 bg-coral-50 px-3.5 py-3 text-sm text-coral-700">{error}</p>}
          <button disabled={busy} className="w-full rounded-xl bg-ink-900 px-4 py-3 font-semibold text-white transition hover:bg-ink-800 disabled:opacity-60">{busy ? "Please wait…" : "Sign in"}</button>
        </form>

        <div className="my-5 flex items-center gap-3 text-xs text-ink-300"><span className="h-px flex-1 bg-ink-100" />OR<span className="h-px flex-1 bg-ink-100" /></div>
        <button disabled={busy} onClick={() => submit(signInAsGuest)} className="w-full rounded-xl border border-ink-200 bg-white px-4 py-3 font-semibold text-ink-800 transition hover:bg-mist-50 disabled:opacity-60">Explore with guest access</button>
        <p className="mt-4 text-center text-xs leading-relaxed text-ink-400">Guest mode uses made-up sample holdings. It cannot view or change anyone’s portfolio.</p>
      </section>
    </main>
  );
}
