import { formatINR, formatPct } from "../lib/format";
import { donutStops } from "../lib/insights";

export default function AllocationPanel({ insights }) {
  return (
    <section className="animate-fade-up grid grid-cols-1 lg:grid-cols-2 gap-4" style={{ animationDelay: "0.08s" }}>
      <AllocationCard title="Asset allocation" subtitle="INR equivalent at the current reference rate" slices={insights.byClass} />
      <AllocationCard title="Broker mix" subtitle="INR equivalent at the current reference rate" slices={insights.byBroker} />
    </section>
  );
}

function AllocationCard({ title, subtitle, slices }) {
  const stops = donutStops(slices);

  return (
    <div className="rounded-[1.5rem] border border-ink-100/80 bg-white/70 backdrop-blur-sm shadow-soft p-6">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h2 className="font-display text-xl text-ink-950">{title}</h2>
          <p className="text-sm text-ink-400 mt-0.5">{subtitle}</p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row items-center gap-8">
        <div className="relative w-36 h-36 shrink-0">
          <div
            className="donut w-full h-full rounded-full"
            style={{ "--donut-stops": stops }}
          />
          <div className="absolute inset-[18%] rounded-full bg-white flex flex-col items-center justify-center text-center">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-400">Total</span>
            <span className="text-sm font-semibold text-ink-900 tabular leading-tight">
              {formatINR(slices.reduce((s, x) => s + x.value, 0))}
            </span>
          </div>
        </div>

        <ul className="flex-1 w-full space-y-3">
          {slices.map((s) => (
            <li key={s.label}>
              <div className="flex items-center justify-between gap-3 text-sm mb-1.5">
                <span className="flex items-center gap-2 min-w-0">
                  <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: s.color }} />
                  <span className="font-medium text-ink-800 truncate">{s.label}</span>
                </span>
                <span className="tabular text-ink-500 shrink-0">{formatPct(s.pct, { signed: false, digits: 1 })}</span>
              </div>
              <div className="h-1.5 rounded-full bg-ink-100 overflow-hidden">
                <div
                  className="bar-fill h-full rounded-full animate-grow-x"
                  style={{ width: `${Math.max(s.pct, 0.5)}%`, background: s.color }}
                />
              </div>
              <p className="mt-1 text-xs text-ink-400 tabular">{formatINR(s.value)}</p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
