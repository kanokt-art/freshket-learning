export const NEW_JOINER_DAYS = 119

export function getDaysSince(date?: Date): number {
  if (!date) return 9999
  return Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24))
}
