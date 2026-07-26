// Placeholder — the sheet-import UI is implemented in stage S5. This stub
// exists so the tab registry can reference it while both stages are built in
// parallel; S5 replaces this file wholesale.
export default function ImportPanel() {
  return (
    <div className="rounded-lg border border-zinc-800 overflow-hidden bg-zinc-950">
      <div className="px-4 py-3 border-b border-zinc-800">
        <h2 className="font-display text-lg font-bold">Sheet Import</h2>
        <p className="text-[11px] text-zinc-500 font-mono">Upload an IWB workbook to review and apply changes.</p>
      </div>
      <div className="px-4 py-10 text-center text-zinc-500 text-sm font-mono">Coming up in this build…</div>
    </div>
  );
}
