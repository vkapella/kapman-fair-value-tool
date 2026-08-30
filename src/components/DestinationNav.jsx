import { BookOpen, ListPlus, Target } from "lucide-react";

// The three top-level destinations in the shipped order (UI-2). One source of
// truth for all three nav chromes on the ladder: sidebar (lg:), rail (md:),
// bottom tabs (base).
export const DESTINATIONS = [
  { id: "main", label: "Main Score Card", short: "Score Card", icon: Target },
  { id: "docs", label: "Docs", short: "Docs", icon: BookOpen },
  { id: "import", label: "Ticker Import", short: "Import", icon: ListPlus },
];

export default function DestinationNav({ topTab, setTopTab }) {
  return (
    <>
      {/* ≥1024: 224px sidebar, labels left-aligned */}
      <aside className="hidden lg:block w-56 shrink-0 border-r border-border">
        <nav aria-label="Destinations" className="sticky top-[67px] p-3">
          <div className="km-section-label px-2.5 mb-2">Destinations</div>
          {DESTINATIONS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTopTab(id)}
              aria-current={topTab === id ? "page" : undefined}
              className={`nav-touch w-full flex items-center gap-2.5 px-2.5 py-2 rounded text-left text-xs transition ${
                topTab === id ? "text-accent bg-accent-dim" : "text-text-3 hover:text-text hover:bg-surface-2"
              }`}
            >
              <Icon className="w-3.5 h-3.5 shrink-0" /> {label}
            </button>
          ))}
        </nav>
      </aside>

      {/* 768–1024: 56px icon rail, aria-labels carry the names */}
      <aside className="hidden md:block lg:hidden w-14 shrink-0 border-r border-border">
        <nav aria-label="Destinations" className="sticky top-[67px] flex flex-col items-center gap-1 py-3">
          {DESTINATIONS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTopTab(id)}
              aria-label={label}
              title={label}
              aria-current={topTab === id ? "page" : undefined}
              className={`nav-touch w-10 h-10 rounded flex items-center justify-center transition ${
                topTab === id ? "text-accent bg-accent-dim" : "text-text-3 hover:text-text hover:bg-surface-2"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
            </button>
          ))}
        </nav>
      </aside>

      {/* <768: 56px bottom tab bar with safe-area insets */}
      <nav
        aria-label="Destinations"
        className="md:hidden fixed inset-x-0 bottom-0 z-[42] border-t border-border bg-surface-2"
        style={{
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
          paddingLeft: "env(safe-area-inset-left, 0px)",
          paddingRight: "env(safe-area-inset-right, 0px)",
        }}
      >
        <div className="flex h-14">
          {DESTINATIONS.map(({ id, short, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTopTab(id)}
              aria-label={label}
              aria-current={topTab === id ? "page" : undefined}
              className={`nav-touch flex-1 flex flex-col items-center justify-center gap-1 transition ${
                topTab === id ? "text-accent" : "text-text-3"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span className="text-[9.5px] font-bold uppercase tracking-[0.1em]">{short}</span>
            </button>
          ))}
        </div>
      </nav>
    </>
  );
}
