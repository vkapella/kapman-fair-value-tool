export default function SignalText({ note }) {
  if (note === "no") return <span className="text-text-3 text-xs font-mono">no</span>;
  if (note === "ON RADAR") return <span className="text-warn text-xs font-mono">ON RADAR</span>;
  return (
    <span className="inline-flex items-center gap-1.5 text-pos text-xs font-mono">
      <span className="w-1.5 h-1.5 rounded-full bg-pos"></span>{note}
    </span>
  );
}
