export default function Legend() {
  return (
    <div className="flex items-center gap-3 text-[10px] font-mono text-zinc-500">
      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-emerald-500"></span>≥80</span>
      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-emerald-400"></span>75–79</span>
      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-amber-400"></span>65–74</span>
      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-zinc-600"></span>&lt;65</span>
    </div>
  );
}
