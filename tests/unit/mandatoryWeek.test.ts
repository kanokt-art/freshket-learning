import { describe, it, expect } from 'vitest'
import {
  ALL_MONTHS, groupByMonth, mandatoryTitleFor, mandatoryTitleForWeekLabel, monthKey, visibleMonthGroups, weekLabelForDate,
  type MandatoryItem,
} from '@/lib/mandatory'

const item = (id: string, y: number, m: number, d: number): MandatoryItem => ({
  id, title: id, description: '', slidesUrl: '', weekLabel: 'Week 1 / Jan 2026', isPublished: true,
  departmentAccess: [], publishedAt: new Date(y, m - 1, d, 12), createdAt: new Date(y, m - 1, d),
}) as unknown as MandatoryItem

describe('the title that goes with a Week the admin set by hand', () => {
  it('reads "Week 42 / Oct 2026" as Mandatory-Week42 Oct 2026', () => {
    expect(mandatoryTitleForWeekLabel('Week 42 / Oct 2026')).toBe('Mandatory-Week42 Oct 2026')
    expect(mandatoryTitleForWeekLabel(' week 7 / sep 2026 ')).toBe('Mandatory-Week7 Sep 2026')
    expect(mandatoryTitleForWeekLabel('Week 43 / October 2026')).toBe('Mandatory-Week43 Oct 2026')
  })

  it('matches the standing title for the same week', () => {
    const d = new Date(2026, 9, 29, 12)
    expect(mandatoryTitleForWeekLabel(weekLabelForDate(d))).toBe(mandatoryTitleFor(d))
  })

  it('is undefined for anything that is not a week label', () => {
    expect(mandatoryTitleForWeekLabel('สัปดาห์ที่ 42')).toBeUndefined()
    expect(mandatoryTitleForWeekLabel('')).toBeUndefined()
  })
})

describe('which month the page shows', () => {
  const items = [item('a', 2026, 10, 29), item('b', 2026, 10, 22), item('c', 2026, 9, 5)]
  const groups = groupByMonth(items)

  it('shows only the selected month', () => {
    const shown = visibleMonthGroups(groups, monthKey(new Date(2026, 9, 31)))
    expect(shown.map((g) => g.key)).toEqual(['2026-10'])
    expect(shown[0].items.map((i) => i.id)).toEqual(['a', 'b'])
  })

  it('shows nothing for a month with no slides (the page then says so)', () => {
    expect(visibleMonthGroups(groups, '2026-11')).toEqual([])
  })

  it('shows every month when asked for all', () => {
    expect(visibleMonthGroups(groups, ALL_MONTHS).map((g) => g.key)).toEqual(['2026-10', '2026-09'])
  })
})
