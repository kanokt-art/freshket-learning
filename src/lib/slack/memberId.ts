// A Slack member id ("U01ABCDEF", or "W..." on Enterprise Grid) is what the Slack app
// needs to message someone. Admins paste whatever Slack gives them, so accept the
// profile link ("Copy link" on the profile), a mention, or the bare id.
const ID_RE = /^[UW][A-Z0-9]{8,14}$/

/** The member id in what an admin pasted, or null when it holds none (channel ids and team ids do not count). */
export function parseSlackMemberId(input: string | null | undefined): string | null {
  const raw = (input ?? '').trim()
  if (!raw) return null

  // "U01ABCDEF", "<@U01ABCDEF>", "@U01ABCDEF"
  const bare = raw.replace(/^<?@?/, '').replace(/>$/, '').toUpperCase()
  if (ID_RE.test(bare)) return bare

  // https://workspace.slack.com/team/U01ABCDEF  ·  https://app.slack.com/client/T0.../U01ABCDEF
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`)
    if (!/(^|\.)slack\.com$/i.test(url.hostname)) return null
    for (const seg of url.pathname.split('/')) {
      const s = seg.toUpperCase()
      if (ID_RE.test(s)) return s
    }
  } catch { /* not a URL */ }
  return null
}
