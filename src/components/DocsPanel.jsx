import {
  CATEGORY_KEYS,
  DEFAULT_JUDGMENT_OVERRIDES,
  RUBRIC_DEF,
  SCORECARD_METHODOLOGY,
  SCORE_WEIGHTS,
} from "../lib/rubric.js";

const pct = (value) => `${Math.round(value * 100)}%`;

function fieldLabel(def, scoreKey) {
  if (scoreKey === "debtVsCash") return "Total Debt + Total Cash (Debt ÷ Cash)";
  const field = [...(def.derivedFields || []), ...def.quantitativeFields, ...def.qualitativeFields]
    .find((candidate) => (candidate.scoreKey || candidate.key) === scoreKey);
  return field?.label || scoreKey;
}

function Methodology({ category }) {
  const def = RUBRIC_DEF[category];
  const method = SCORECARD_METHODOLOGY[category];
  return (
    <details open className="border border-zinc-800 rounded-lg bg-zinc-950 overflow-hidden">
      <summary className="cursor-pointer list-none px-4 py-3 hover:bg-zinc-900/50">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h3 className="font-display text-base font-bold text-zinc-100">{def.label.replace(/\s*\/\d+$/, "")}</h3>
          <span className="font-mono text-[11px] text-emerald-300">{def.max} points of the 100-point score ({def.max}%)</span>
        </div>
        <p className="mt-1 text-xs text-zinc-400">{method.calculation}</p>
      </summary>
      <div className="border-t border-zinc-800">
        <p className="px-4 py-3 text-xs leading-relaxed text-zinc-400 bg-zinc-900/30"><span className="text-zinc-200">Default when unavailable:</span> {method.defaultBehavior}</p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[850px] text-left text-xs">
            <thead className="bg-zinc-900/50 text-[10px] uppercase tracking-wider text-zinc-500">
              <tr className="hairline">
                <th className="px-4 py-2 font-medium">Factor</th>
                <th className="px-3 py-2 text-right font-medium">Weight</th>
                <th className="px-3 py-2 font-medium">Calculation / normalized factor score</th>
                <th className="px-4 py-2 font-medium">Source and default behavior</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(SCORE_WEIGHTS[category]).map(([scoreKey, weight]) => {
                const factor = method.factors[scoreKey];
                return (
                  <tr key={scoreKey} className="hairline align-top">
                    <td className="px-4 py-3 font-medium text-zinc-200">{fieldLabel(def, scoreKey)}</td>
                    <td className="px-3 py-3 text-right font-mono text-emerald-300 whitespace-nowrap">
                      {pct(weight)} of category
                      <span className="block text-[10px] text-zinc-500">max {(def.max * weight).toFixed(1)} pts overall</span>
                    </td>
                    <td className="px-3 py-3 leading-relaxed text-zinc-300">{factor.calculation}</td>
                    <td className="px-4 py-3 leading-relaxed text-zinc-400">{factor.source}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </details>
  );
}

export default function DocsPanel() {
  const defaultGrowthFunding = RUBRIC_DEF.growthScore.qualitativeFields
    .find((field) => field.key === "growthFundingQuality")
    ?.options[DEFAULT_JUDGMENT_OVERRIDES.growthFundingQuality];
  const defaultMoatDurability = RUBRIC_DEF.moat.qualitativeFields
    .find((field) => field.key === "moatDurability")
    ?.options[DEFAULT_JUDGMENT_OVERRIDES.moatDurability];

  return (
    <section className="rounded-lg border border-zinc-800 overflow-hidden bg-zinc-950">
      <div className="px-4 py-3 border-b border-zinc-800">
        <h2 className="font-display text-lg font-bold">Fair Value Tool documentation</h2>
        <p className="text-[11px] text-zinc-500 font-mono">Live calculation rules, weights, data ownership, and default behavior.</p>
      </div>

      <div className="grid gap-px bg-zinc-800 md:grid-cols-2">
        <Doc title="Total score">Total Score = Valuation /20 + Growth /20 + Moat /20 + Execution Risk /10 + Economy /30. Each category is rounded to a whole point after its weighted factor calculation; total score is therefore 0–100. Missing factors receive their documented neutral/default score rather than shifting weight to other factors.</Doc>
        <Doc title="Intrinsic value formula">Intrinsic Value = Valuation TTM EPS × (P/E no-growth + Growth Multiplier × IV Growth Assumption %) × (Average AAA Yield ÷ Bond Yield). Defaults in Settings are 7, 1, 4.4%, and 4.4%. If valuation EPS is not positive, or the formula result is not positive, IV and % of IV are unavailable rather than treated as cheap.</Doc>
        <Doc title="EPS selection and pin">GAAP TTM EPS is provider-derived; Adjusted TTM EPS is the sum of four valid Finnhub earnings actuals. When both sources are available, automatic valuation EPS selects the lower positive value. Click either source to copy it into Valuation TTM EPS. Editing Valuation TTM EPS sets the Operator basis and pins it; the EPS pin prevents only that formula input from refreshing.</Doc>
        <Doc title="IV growth is not provider growth">IV Growth Assumption is an operator forward-looking input used only in intrinsic value. TTM EPS Growth YoY is a backward-looking provider metric used only in Growth scoring. Ticker Import starts IV Growth Assumption at 0% for review; neither value substitutes for the other.</Doc>
        <Doc title="Provider values and manual overrides">Provider values are the live defaults for quantitative factors. A manual factor entry replaces only that factor and is marked in the grid; clearing it restores the provider value on the next calculation. A failed provider refresh never blocks manual edits.</Doc>
        <Doc title="Category score pin">Unpinned categories use the live model score and refresh when factors change. Editing a Category Score pins an operator-curated value. Unpinning restores the model result while retaining the curated value for a future re-pin. A category pin does not freeze its underlying provider factors.</Doc>
        <Doc title="Judgment defaults">An unassessed judgment is neutral (55%) unless the platform seeds a conservative default. Earnings Quality starts as “{defaultGrowthFunding}”; Moat Trajectory starts as “{defaultMoatDurability}”. Both are operator-adjustable and should be reviewed rather than mistaken for provider facts.</Doc>
        <Doc title="Allocation signals">The tool abstains when % of IV is unavailable. Buy Shares requires Score ≥75 and % of IV &lt;110; Sell Puts requires Score ≥75 and % of IV &lt;100; Buy Calls requires Score ≥75 and % of IV &lt;92. Position-size notes are algorithmic defaults, not investment advice.</Doc>
      </div>

      <div className="border-t border-zinc-800 p-4 space-y-3">
        <div>
          <h2 className="font-display text-lg font-bold">Scorecard calculations and weights</h2>
          <p className="mt-1 text-xs leading-relaxed text-zinc-500">Each row below is a live score component. The factor score is normalized first, multiplied by its category weight, then scaled to the category maximum shown.</p>
        </div>
        {CATEGORY_KEYS.map((category) => <Methodology key={category} category={category} />)}
      </div>

      <div className="border-t border-zinc-800 px-4 py-3 text-xs leading-relaxed text-zinc-500">
        This is a screening heuristic, not investment advice. Provider coverage, reported earnings definitions, assumptions, and market conditions can be incomplete or wrong; review filings and use independent judgment.
      </div>
    </section>
  );
}

function Doc({ title, children }) {
  return <div className="bg-zinc-950 p-4"><h3 className="text-xs uppercase tracking-wider text-emerald-300">{title}</h3><p className="mt-2 text-sm leading-relaxed text-zinc-400">{children}</p></div>;
}
