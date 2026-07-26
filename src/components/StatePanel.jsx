export default function StatePanel({ title, message, actionLabel, onAction }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950 px-6 py-10 text-center">
      <div className="font-display text-xl font-bold text-zinc-100">{title}</div>
      <p className="mt-2 text-sm text-zinc-500">{message}</p>
      {actionLabel && (
        <button onClick={onAction}
          className="mt-5 px-4 py-2 rounded bg-emerald-500 hover:bg-emerald-400 text-emerald-950 text-xs font-medium transition">
          {actionLabel}
        </button>
      )}
    </div>
  );
}
