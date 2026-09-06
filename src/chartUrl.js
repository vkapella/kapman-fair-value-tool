// The family chart destination (decision 66, Amendment 04 §2): Barchart's
// interactive chart, one URL builder per app, symbol URL-encoded so BRK.B and
// symbols with slashes survive. Changing the provider is a decision-log entry,
// not a local edit. Every rendered ticker links (decision 65); suppression, if
// ever wanted for cash-like instruments, is an explicit isChartable predicate
// added here — never a symbol list.
export function chartUrl(symbol) {
  return `https://www.barchart.com/stocks/quotes/${encodeURIComponent(symbol)}/interactive-chart`;
}

/** Props every symbol link shares (decision 64): new tab, no opener, the row's
 *  own action never fires, the accessible name carries the destination. */
export function symbolLinkProps(symbol) {
  return {
    href: chartUrl(symbol),
    target: "_blank",
    rel: "noopener noreferrer",
    onClick: (e) => e.stopPropagation(),
    "aria-label": `Open ${symbol} chart on Barchart`,
  };
}
