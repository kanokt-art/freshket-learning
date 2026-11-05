// A course's cover beside its title: the image, or a soft tile when the course has none. A cover that is not a
// URL (a colour or gradient some courses carry) is painted as the tile's background.
export function CourseCover({ url, className = 'size-12' }: { url?: string; className?: string }) {
  const isImg = !!url && (url.startsWith('http') || url.startsWith('/'))
  if (isImg) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" className={`${className} rounded-xl object-cover border border-gray-100 shrink-0`} />
  }
  return (
    <span className={`${className} rounded-xl shrink-0 flex items-center justify-center bg-freshket-50 text-freshket-500`} style={url ? { background: url } : undefined}>
      <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
      </svg>
    </span>
  )
}
