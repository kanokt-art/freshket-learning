import { test, expect, gotoAsUser } from './fixtures'

// Regression guard for BUG-02: the answer key must not be present in what the
// quiz page holds before the learner submits.
//
// Fixture `assess-01` (src/lib/utils/mockData.ts) is well suited to this: Q1 is
// multiple-choice whose correct choice is `c2`, and Q3 is a drag_drop whose true
// pairing is ผักใบเขียว→ร้านอาหารทั่วไป / ผลไม้พรีเมียม→โรงแรม 5 ดาว /
// เครื่องเทศสด→ครัวอาหารไทย. Both must be unrecoverable from the page.
//
// Runs in demo mode, so it does NOT exercise firestore.rules or the API route —
// it verifies the client-side property that the sanitizer is applied on the take
// path. The rules/API half belongs to the `live` suite (test plan §1).

const QUIZ = '/assessment/assess-01'

test('no isCorrect flag is exposed on the quiz page', async ({ page }) => {
  await gotoAsUser(page, 'sale', QUIZ)

  await expect(page.getByText('Freshket เชี่ยวชาญในสินค้าประเภทใดเป็นหลัก?')).toBeVisible({ timeout: 15_000 })

  const html = await page.content()
  // Covers both a plain serialization and the escaped form inside an RSC/inline
  // script payload.
  expect(html).not.toContain('"isCorrect":true')
  expect(html).not.toContain('isCorrect\\":true')
})

// NOTE on scope: the quiz renders one question at a time and holds the payload in
// React state rather than serializing it into the HTML, so the DOM can't be used
// to inspect the whole key. Proving the drag pairing is scrambled is therefore
// done in the unit suite (tests/unit/grade.test.ts asserts that an answer derived
// from the sanitized question grades as WRONG against the real key). What this
// test covers is the complementary UI property: sanitizing didn't break the
// question — every left label and every option is still there to answer with.
test('the drag_drop question still renders every label and option', async ({ page }) => {
  await gotoAsUser(page, 'sale', QUIZ)
  await expect(page.getByText('Freshket เชี่ยวชาญในสินค้าประเภทใดเป็นหลัก?')).toBeVisible({ timeout: 15_000 })

  // Walk to Q3 (the drag_drop one).
  await page.getByText('สินค้าแห้ง (Dry Goods)').click()
  await page.getByRole('button', { name: 'ถัดไป' }).click()
  const textarea = page.locator('textarea').first()
  if (await textarea.count()) await textarea.fill('ทดสอบคำตอบ')
  await page.getByRole('button', { name: 'ถัดไป' }).click()

  await expect(page.getByText('จับคู่ประเภทสินค้ากับกลุ่มลูกค้าที่เหมาะสม')).toBeVisible({ timeout: 10_000 })

  for (const label of ['ผักใบเขียว', 'ผลไม้พรีเมียม', 'เครื่องเทศสด']) {
    await expect(page.getByText(label).first()).toBeVisible()
  }
  for (const option of ['ร้านอาหารทั่วไป', 'โรงแรม 5 ดาว', 'ครัวอาหารไทย']) {
    await expect(page.getByText(option).first()).toBeVisible()
  }
})

test('grading still works end to end and reveals the answer only after submit', async ({ page }) => {
  await gotoAsUser(page, 'sale', QUIZ)
  await expect(page.getByText('Freshket เชี่ยวชาญในสินค้าประเภทใดเป็นหลัก?')).toBeVisible({ timeout: 15_000 })

  // Q1: deliberately pick a wrong choice so the reveal has something to show.
  await page.getByText('สินค้าแห้ง (Dry Goods)').click()
  await page.getByRole('button', { name: 'ถัดไป' }).click()

  // Q2 open-ended — type something, then advance.
  const textarea = page.locator('textarea').first()
  if (await textarea.count()) await textarea.fill('ทดสอบคำตอบ')
  await page.getByRole('button', { name: 'ถัดไป' }).click()

  // Q3 drag_drop — skip matching and submit as-is.
  await page.getByRole('button', { name: /ส่งคำตอบ/ }).click()

  // Verdict comes back (server in live mode, local grade in demo).
  await expect(page.getByText(/ผ่านแบบทดสอบ|ยังไม่ผ่าน/).first()).toBeVisible({ timeout: 15_000 })

  // Now — and only now — the correct answer is shown.
  await expect(page.getByText(/เฉลย:/).first()).toBeVisible({ timeout: 10_000 })
})
