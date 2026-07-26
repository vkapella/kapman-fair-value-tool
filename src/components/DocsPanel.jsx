export default function DocsPanel() {
  return (
    <section className="rounded-lg border border-zinc-800 overflow-hidden bg-zinc-950">
      <div className="px-4 py-3 border-b border-zinc-800">
        <h2 className="font-display text-lg font-bold">Fair Value Tool documentation</h2>
        <p className="text-[11px] text-zinc-500 font-mono">How the valuation inputs and refresh workflow fit together.</p>
      </div>
      <div className="grid gap-px bg-zinc-800 md:grid-cols-2">
        <Doc title="Intrinsic value formula">Intrinsic Value = Valuation TTM EPS × (PE_no_growth + g × Growth%) × (Average AAA yield / Bond yield). P/E and intrinsic value always use Valuation TTM EPS.</Doc>
        <Doc title="EPS fields">GAAP TTM EPS is derived from Finnhub trailing P/E and the Yahoo traded-share price, with Yahoo trailing EPS as fallback. Adjusted TTM EPS sums the latest four valid, distinct Finnhub earnings “actual” quarters; the provider defines that reported operating/normalized figure. Valuation TTM EPS is the one deliberate input used by the model.</Doc>
        <Doc title="Basis and pin">Click GAAP or Adjusted to copy it into Valuation EPS and set that basis. Editing Valuation EPS directly sets the basis to Operator and pins it. A pin protects only Valuation EPS; it never prevents source EPS or price refreshes.</Doc>
        <Doc title="Provenance and refresh">Source labels, timestamps, and unavailable reasons describe the most recent provider result. Refresh is owned by the server; the browser displays the returned record and never calls a market-data provider directly.</Doc>
        <Doc title="Difference warning">The Intrinsic Value table shows (Adjusted − GAAP) / |GAAP|. Amber indicates a 10–14.9% difference; red indicates 15% or more. A missing or zero GAAP EPS has no meaningful percentage difference.</Doc>
        <Doc title="Limitations and disclaimer">This is a heuristic, not investment advice. Earnings definitions, estimates, growth assumptions, interest rates, and data-provider coverage can all be incomplete or wrong. Review filings and make your own decisions.</Doc>
      </div>
    </section>
  );
}

function Doc({ title, children }) {
  return <div className="bg-zinc-950 p-4"><h3 className="text-xs uppercase tracking-wider text-emerald-300">{title}</h3><p className="mt-2 text-sm leading-relaxed text-zinc-400">{children}</p></div>;
}
