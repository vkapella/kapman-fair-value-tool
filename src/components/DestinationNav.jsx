import { BookOpen, ListPlus, Target } from "lucide-react";

// The three top-level destinations in the shipped order (UI-2).
export const DESTINATIONS = [
  { id: "main", label: "Main Score Card", short: "Score Card", icon: Target },
  { id: "docs", label: "Docs", short: "Docs", icon: BookOpen },
  { id: "import", label: "Ticker Import", short: "Import", icon: ListPlus },
];

// One markup tree, three presentations — sidebar at lg:, icon rail in the md:
// band, bottom tab bar below — all from the shared theme's .km-nav primitives
// (kapman-ui.css). This component previously hand-rolled all three in
// Tailwind, which is the duplication the primitive exists to end.
//
// These are links-by-another-name, not a tab widget, so the active item takes
// aria-current="page" (decision 38). The primitive styles both that and
// aria-selected, so it serves the Screener's real tab widget too.
export default function DestinationNav({ topTab, setTopTab }) {
  return (
    <nav className="km-nav" aria-label="Destinations">
      <div className="km-section-label px-4 mb-2">Destinations</div>
      <div className="km-nav-items">
        {DESTINATIONS.map(({ id, label, short, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTopTab(id)}
            aria-current={topTab === id ? "page" : undefined}
            // The rail hides the label, so the accessible name has to come
            // from somewhere that survives it.
            aria-label={label}
            title={label}
            // The 44px coarse-pointer floor lives in .km-nav-item now
            // (theme 6d78e55), so no local touch class here.
            className="km-nav-item"
          >
            <Icon className="km-nav-icon" aria-hidden="true" />
            <span className="km-nav-label">
              {/* The bottom bar stacks a glyph over a short label; the sidebar
                  has room for the full destination name. */}
              <span className="hidden md:inline">{label}</span>
              <span className="md:hidden">{short}</span>
            </span>
          </button>
        ))}
      </div>
    </nav>
  );
}
