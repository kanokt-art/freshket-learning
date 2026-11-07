// A red count badge, the way Facebook marks something new: a number in a red pill, "9+" past nine. It is a
// signal only: it stays until the thing it points at has been opened and read.
export function NotifBadge({ count, label, className = '' }: { count: number; label?: string; className?: string }) {
  if (count <= 0) return null
  return (
    <span
      role="status"
      aria-label={label ?? `${count} รายการใหม่`}
      className={`inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-rose-500 text-white text-xs font-bold tabular-nums leading-none ring-2 ring-white shadow-sm ${className}`}
    >
      {count > 9 ? '9+' : count}
    </span>
  )
}
