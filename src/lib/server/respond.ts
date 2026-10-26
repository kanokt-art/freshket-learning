import { NextResponse } from 'next/server'
import type { ApiResult } from './dataApi'

/** An ApiResult as an HTTP response. Errors carry only their short, caller-safe text. */
export function toResponse<T>(result: ApiResult<T>): NextResponse {
  return result.ok
    ? NextResponse.json(result.value)
    : NextResponse.json({ error: result.error }, { status: result.status })
}

/** Read a JSON body, or null when there is none worth reading. */
export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json()
  } catch {
    return null
  }
}
