// Judgment (qualitative) factor select. The first option is always the
// explicit "not assessed" state mapping to `null` — it must be the default
// for any field with no stored manual value, never a pre-selected middle
// option (that would silently record a judgment the operator never made).
export default function JudgmentCell({ field, manual, onChange }) {
  const assessed = manual != null;
  return (
    <select
      value={assessed ? manual : ""}
      onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
      title={field.description}
      className={`bg-zinc-900 border border-zinc-800 px-1.5 py-1 text-xs rounded outline-none max-w-[11rem] ${
        assessed ? "text-zinc-100" : "text-zinc-500 italic"
      }`}
    >
      <option value="" className="italic">— not assessed —</option>
      {(field.options || []).map((opt, idx) => (
        <option key={opt} value={idx}>{opt}</option>
      ))}
    </select>
  );
}
