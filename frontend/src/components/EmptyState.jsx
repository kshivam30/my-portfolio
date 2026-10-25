export default function EmptyState({ onUpload }) {
  return (
    <section className="animate-fade-up rounded-[1.75rem] border border-ink-100/80 bg-white/70 backdrop-blur-sm shadow-soft px-6 py-16 sm:py-20 text-center">
      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-ink-400">Get started</p>
      <h1 className="font-display text-4xl sm:text-5xl text-ink-950 mt-3 tracking-tight">
        Your wealth ledger
      </h1>
      <p className="mt-4 text-ink-500 max-w-md mx-auto leading-relaxed">
        Upload broker holdings to see net worth, allocation, concentration, and movers in one place.
        US brokerage and EPF tracking are next.
      </p>
      <button
        type="button"
        onClick={onUpload}
        className="mt-8 inline-flex items-center gap-2 rounded-2xl bg-ink-900 px-6 py-3.5 text-sm font-semibold text-white hover:bg-ink-800 transition"
      >
        Upload first holdings
      </button>
    </section>
  );
}
