import { createSign } from 'crypto'

interface OIDCTokenPayload {
  iss: string
  sub: string
  aud: string
  iat: number
  exp: number
  target_audience: string
}

function base64url(input: Buffer | string): string {
  const buf = typeof input === 'string' ? Buffer.from(input) : input
  return buf.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

export async function generateCloudRunOIDCToken(targetAudience: string): Promise<string> {
  const serviceAccountEmail = process.env.GOOGLE_SA_EMAIL!
  const rawKey = process.env.GOOGLE_SA_PRIVATE_KEY!.replace(/\\n/g, '\n')

  const now = Math.floor(Date.now() / 1000)

  const header = { alg: 'RS256', typ: 'JWT' }
  const payload: OIDCTokenPayload = {
    iss: serviceAccountEmail,
    sub: serviceAccountEmail,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
    target_audience: targetAudience,
  }

  const headerB64  = base64url(Buffer.from(JSON.stringify(header)))
  const payloadB64 = base64url(Buffer.from(JSON.stringify(payload)))
  const signingInput = `${headerB64}.${payloadB64}`

  const sign = createSign('RSA-SHA256')
  sign.update(signingInput)
  const signature = base64url(sign.sign(rawKey))

  const selfSignedJwt = `${signingInput}.${signature}`

  // Exchange self-signed JWT for Google OIDC token
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: selfSignedJwt,
    }),
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`Failed to obtain OIDC token: ${err}`)
  }

  const data = await response.json()
  return data.id_token as string
}

export async function callCloudRun<T = unknown>(
  path: string,
  body: unknown,
  method: 'GET' | 'POST' = 'POST',
): Promise<T> {
  const baseUrl = process.env.CLOUD_RUN_URL!
  const token = await generateCloudRunOIDCToken(baseUrl)

  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: method === 'POST' ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    throw new Error(`Cloud Run request failed: ${res.status} ${res.statusText}`)
  }

  return res.json() as Promise<T>
}
