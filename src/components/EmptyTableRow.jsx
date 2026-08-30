export default function EmptyTableRow({ colSpan, message }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-10 text-center text-xs text-text-3 font-mono">
        {message}
      </td>
    </tr>
  );
}
