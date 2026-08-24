import os from 'node:os'
import path from 'node:path'

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
      },
      {
        protocol: 'https',
        hostname: 'ivpysunrulnrdykfaezk.supabase.co',
      },
      {
        // Freshket brand logo asset bucket (separate Supabase project from the
        // one above, which still hosts admin-uploaded course thumbnails).
        protocol: 'https',
        hostname: 'dwrbdsoumciwjszloluz.supabase.co',
      },
    ],
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            // Allow Firebase signInWithPopup to communicate back to parent window
            key: 'Cross-Origin-Opener-Policy',
            value: 'same-origin-allow-popups',
          },
          // This is an internal HR tool holding employee PII, so it should never be
          // frameable by another site — without this the app is clickjackable.
          { key: 'X-Frame-Options', value: 'DENY' },
          // Stop browsers from MIME-sniffing a response into something executable.
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          // Don't leak internal paths (which embed course/user ids) to third parties.
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // No feature of this app needs these device APIs.
          { key: 'Permissions-Policy', value: 'geolocation=(), microphone=(), payment=(), usb=()' },
          // Force HTTPS for a year. Safe on Vercel, which is HTTPS-only.
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
          {
            // frame-ancestors is the modern, CSP-native counterpart to
            // X-Frame-Options (kept above for older browsers).
            //
            // Deliberately NOT a full CSP: Next.js dev/prod both need
            // 'unsafe-inline'/'unsafe-eval' for their runtime, and this app also
            // sets style={{...}} widely plus `camera` capture on the quiz page —
            // so a script-src policy needs its own testing pass to avoid breaking
            // the app. frame-ancestors is the part that is safe to ship blind.
            key: 'Content-Security-Policy',
            value: "frame-ancestors 'none'",
          },
        ],
      },
    ]
  },
  // This project lives inside a OneDrive folder, whose real-time file sync races
  // with webpack's filesystem cache (.next/cache) — the cache pack files got moved
  // out from under the dev server mid-compile, producing ENOENT + "chunk 404".
  //
  // The old fix (config.cache = false) stopped the corruption but disabled the
  // cache ENTIRELY, so `next dev` recompiled every route from scratch on each
  // navigation — the main cause of slow page changes in dev. Instead we keep the
  // persistent cache but relocate it OUTSIDE the synced folder (OS temp dir), so
  // incremental rebuilds stay fast and OneDrive never touches the pack files.
  // (Production `next build` is unaffected — it uses its own .next/cache.)
  webpack(config, { dev }) {
    if (dev) {
      const cacheDirectory = path.join(os.tmpdir(), 'freshket-next-cache')
      config.cache =
        config.cache && typeof config.cache === 'object'
          ? { ...config.cache, cacheDirectory }
          : { type: 'filesystem', cacheDirectory }
    }
    return config
  },
}

export default nextConfig
