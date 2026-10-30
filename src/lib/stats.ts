// The per-person training summary (userStats/{uid}) is kept by the SERVER.
//
// It used to be recomputed here after each lesson and written from the browser, which meant
// a learner could write any summary for themselves. The data door now refreshes a person's
// summary whenever a trainingRecords document of theirs is written, and the admin rebuild
// (/api/stats/rebuild) recomputes everyone's. This stays as a no-op so callers need no change.

export async function recomputeMyStats(_uid: string | undefined): Promise<void> {
  // Nothing to do: the server updates the summary when the record is saved.
}
