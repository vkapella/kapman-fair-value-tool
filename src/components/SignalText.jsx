export default function SignalText({ note }) {
  if (note === "no") return <span className="text-zinc-600 text-xs font-mono">no</span>;
  if (note === "ON RADAR") return <span className="text-amber-300 text-xs font-mono">ON RADAR</span>;
  return (
    <span className="inline-flex items-center gap-1.5 text-emerald-300 text-xs font-mono">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>{note}
    </span>
  );
}
