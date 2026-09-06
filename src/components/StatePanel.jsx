export default function StatePanel({ title, message, actionLabel, onAction }) {
  return (
    <div className="rounded-lg border border-border bg-surface px-6 py-10 text-center">
      <div className="font-display text-xl font-bold text-text">{title}</div>
      <p className="mt-2 text-sm text-text-3">{message}</p>
      {actionLabel && (
        <button onClick={onAction}
          className="mt-5 px-4 py-2 rounded bg-accent hover:brightness-105 text-text-on-fill text-xs font-medium transition">
          {actionLabel}
        </button>
      )}
    </div>
  );
}
