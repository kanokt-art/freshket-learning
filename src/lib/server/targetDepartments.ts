import { TARGET_DEPARTMENTS_DOC, parseTargetDepartments, setTargetDepartments } from '@/lib/modules'

// Loads the switched-on departments into the live list the server's checks read. Called at the start
// of every authenticated request; a short cache keeps that to one read every few seconds. A failed
// read keeps what is already loaded (the defaults on a cold start): a database blip must not switch
// a department off.

const TTL_MS = 30_000
let lastLoad = 0

export async function refreshTargetDepartments(
  store: { get(path: string, id: string): Promise<unknown> },
  now: number = Date.now(),
): Promise<void> {
  if (now - lastLoad < TTL_MS) return
  try {
    setTargetDepartments(parseTargetDepartments(await store.get('appConfig', TARGET_DEPARTMENTS_DOC)))
    lastLoad = now
  } catch {
    // keep the current list
  }
}

/** For tests: forget the cache. */
export function resetTargetDepartmentsCache(): void {
  lastLoad = 0
}
