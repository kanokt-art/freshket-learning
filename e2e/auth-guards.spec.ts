import { test, expect, gotoAsUser } from './fixtures'

// Negative authorization suite (test plan §6).
//
// Every route gate in this app is a hand-written render guard inside the page
// component — there is no middleware.ts — so a gate can only be verified by
// actually driving the browser to the URL as the wrong role. These tests exist
// to keep the guards from silently disappearing: /admin/settings shipped with no
// check at all, and nothing caught it.

const DENY = 'ไม่มีสิทธิ์เข้าถึงหน้านี้'

test.describe('super_admin-only pages reject lower roles', () => {
  // E-03 — /admin/settings had NO role check: any signed-in employee who typed
  // the URL got the module-access (RBAC) editor plus the full employee roster.
  for (const role of ['sale', 'teamLead', 'manager'] as const) {
    test(`/admin/settings denies ${role}`, async ({ page }) => {
      await gotoAsUser(page, role, '/admin/settings')

      await expect(page.getByText(DENY)).toBeVisible()
      // The editor's own controls must not render at all.
      await expect(page.getByRole('heading', { name: 'Module Settings' })).toHaveCount(0)
      await expect(page.getByText('ตั้งค่าว่าแผนกไหนเข้าถึง module ไหนได้บ้าง')).toHaveCount(0)
    })
  }

  test('/admin/settings still works for super_admin', async ({ page }) => {
    await gotoAsUser(page, 'superAdmin', '/admin/settings')

    await expect(page.getByRole('heading', { name: 'Module Settings' })).toBeVisible()
    await expect(page.getByText(DENY)).toHaveCount(0)
  })

  test('/assessment redirects a learner away from quiz authoring', async ({ page }) => {
    await gotoAsUser(page, 'sale', '/assessment')

    // The page replaces the route rather than rendering a deny panel.
    await expect(page).not.toHaveURL(/\/assessment$/)
  })

  test('/log denies a learner', async ({ page }) => {
    await gotoAsUser(page, 'sale', '/log')
    await expect(page.getByText('หน้านี้สำหรับ Super Admin เท่านั้น')).toBeVisible()
  })

  test('/admin/announcements denies a learner', async ({ page }) => {
    await gotoAsUser(page, 'sale', '/admin/announcements')
    await expect(page.getByText(DENY)).toBeVisible()
  })
})

test.describe('team_lead+ pages reject a learner', () => {
  for (const path of ['/users', '/manager', '/team-lead']) {
    test(`${path} denies sale`, async ({ page }) => {
      await gotoAsUser(page, 'sale', path)

      // /users and /users/[id] redirect to /sale; /manager and /team-lead render
      // a deny panel. Either is a pass — what must NOT happen is the roster
      // rendering for a learner.
      const denied = await page.getByText(DENY).count()
      const redirected = !new RegExp(`${path}$`).test(new URL(page.url()).pathname)
      expect(denied > 0 || redirected).toBeTruthy()
    })
  }
})

test.describe('learner-reachable pages stay reachable', () => {
  // Guards must fail closed for the wrong role but never lock out the right one.
  // This is the regression half of the suite: it would have caught a fix that
  // over-gated a page (e.g. gating /tools/mandatory, which new joiners use).
  for (const path of ['/sale', '/courses', '/tools', '/tools/mandatory', '/profile']) {
    test(`${path} allows sale`, async ({ page }) => {
      await gotoAsUser(page, 'sale', path)

      await expect(page.getByText(DENY)).toHaveCount(0)
      expect(new URL(page.url()).pathname).toBe(path)
    })
  }
})
