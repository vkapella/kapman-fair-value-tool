export default function Legend() {
  return (
    <div className="flex items-center gap-3 text-[10px] font-mono text-text-3">
      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-pos"></span>≥80</span>
      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-accent"></span>75–79</span>
      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-warn"></span>65–74</span>
      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-surface-3"></span>&lt;65</span>
    </div>
  );
}
