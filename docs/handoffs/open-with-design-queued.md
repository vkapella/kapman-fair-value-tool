# Handoff — two rows for `OPEN-WITH-DESIGN.md` QUEUED

**From:** kapman-fair-value-tool, session of 2026-08-31 (re-vendor at `26f4898`, decisions 49/50/51/54/55).
**For:** the consolidating (Tradelog) session, which owns `kapman-design/theme/OPEN-WITH-DESIGN.md`.

Both rows are already appended to that file's **QUEUED** table in the shared
clone's working tree, directly after the em-dash row. They are staged here as
well because an uncommitted append in a clone three sessions share is one
`git checkout .` away from being lost, and this programme has now paid twice
for a finding that went quiet.

A push to `kapman-tradelog/main` is a Tradelog production release, so this
session did not commit them there — landing them is the theme owner's call.

Both were found while carrying out Amendment 03 and are grounded in file and
line. Neither blocks anything here.

---

| The grid CSS's row-height query contradicts the README ladder | `NOTE` | Fair Value, decision 54/55 re-vendor, 2026-08-31 | Raised while judging every `(pointer: coarse) and (max-width: …)` in the repo after decision 54, per the ruling that control floors lose the width clause and row density keeps it. `design/kapman-grid.css:35` and `:43` both scope `--row-h-touch` to `(pointer: coarse) and (max-width: 767px)`, so the **768–1024 band takes `--row-h` (30px)** — but README's ladder table (`design/README.md:190–192`) puts that band on `--row-h-touch`, and Fair Value's UI-5 acceptance says the same ("pointer height at ≥1024, 44px below"). Decision 55 says row density stays width-driven by the UI-1 ladder, which also argues the `(pointer: coarse)` half should not be there at all: an iPad in the rail band is exactly the device the ladder is describing. Fair Value's `KapmanGrid` mirrors the vendored query rather than the ladder, deliberately — the JS number that drives AG Grid's virtualisation must agree with the CSS min-height or the two fight — so **this is held rather than forked locally**. One of the two needs to move; if the query does, both siblings re-vendor. |

| `.km-grid-col-symbol`'s fixed 76px overflows its own 76px cell | `NOTE` | Fair Value, decision 50, 2026-08-31 | `design/kapman-grid.css:76` sets `width: var(--pinned-symbol)` — 76px, the *column's* width — on the span **inside** the cell. With `--ag-cell-horizontal-padding: 8px` (`:32`) the cell's content box is 74px at best, so the span is wider than the box that holds it by construction. Measured at 1440×900: the cell's `scrollWidth` exceeded `clientWidth` by 14–16px on every row. It stays invisible only while the span is `display: inline`, where `width` does not apply — the moment a consumer makes it a block or a flex item to satisfy decision 50's yield order (cell text truncates first), it overflows the frozen boundary. Fair Value overrode it with `w-full` / `flex-1 min-w-0`. Suggest the theme rule use `max-width: 100%` (or `width: 100%`) rather than the column width, since it is sizing a child of a cell the grid has already sized. |
