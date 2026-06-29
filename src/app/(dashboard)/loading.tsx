// Shown instantly by Next.js while the route's JS chunk is compiling/loading.
// No imports needed — keep this file dependency-free so it renders immediately.
export default function DashboardLoading() {
  return (
    <div className="flex flex-col h-full bg-slate-50 animate-pulse">

      {/* ── Header skeleton ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-6 py-4 bg-white border-b border-gray-100 shrink-0">
        <div className="space-y-1.5">
          <div className="h-5 w-40 bg-gray-200 rounded-full" />
          <div className="h-3 w-24 bg-gray-100 rounded-full" />
        </div>
        <div className="flex items-center gap-3">
          <div className="h-5 w-16 bg-gray-100 rounded-full" />
          <div className="size-8 rounded-full bg-gray-200" />
        </div>
      </div>

      {/* ── Content skeleton ─────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto p-6 space-y-5">

        {/* Stat cards row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="bg-white rounded-2xl border border-gray-100 p-5">
              <div className="h-3 w-20 bg-gray-100 rounded-full mb-4" />
              <div className="h-8 w-14 bg-gray-200 rounded-xl mb-1" />
              <div className="h-2.5 w-16 bg-gray-100 rounded-full" />
            </div>
          ))}
        </div>

        {/* Main content card */}
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          {/* Card header */}
          <div className="px-6 py-4 border-b border-gray-50 flex items-center gap-4">
            <div className="h-4 w-32 bg-gray-200 rounded-full" />
            <div className="h-4 w-16 bg-gray-100 rounded-full" />
          </div>
          {/* Rows */}
          <div className="divide-y divide-gray-50">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} className="flex items-center gap-4 px-6 py-3.5">
                <div className="size-9 rounded-xl bg-gray-100 shrink-0" />
                <div className="flex-1 space-y-1.5 min-w-0">
                  <div className="h-3.5 bg-gray-200 rounded-full w-1/3" />
                  <div className="h-3 bg-gray-100 rounded-full w-1/4" />
                </div>
                <div className="h-3 w-14 bg-gray-100 rounded-full hidden sm:block" />
                <div className="h-6 w-16 bg-gray-100 rounded-full hidden md:block" />
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  )
}
