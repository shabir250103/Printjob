import { expect, test } from '@playwright/test'

test('login screen renders required credentials', async ({ page }) => {
  await page.goto('/login')
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible()
  await expect(page.getByLabel('Username')).toHaveAttribute('required', '')
  await expect(page.getByLabel('Password')).toHaveAttribute('required', '')
})

test('protected workflow redirects guests to login', async ({ page }) => {
  await page.goto('/pipeline')
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible()
})

test('invalid credentials show an error and do not open the dashboard', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('Username').fill('playwright-invalid-user')
  await page.getByLabel('Password').fill('invalid-test-password')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page).toHaveURL(/\/login$/)
})

test('configured local user can sign in', async ({ page }) => {
  const username = process.env.E2E_USERNAME
  const password = process.env.E2E_PASSWORD
  test.skip(!username || !password, 'Provide local test credentials through E2E_USERNAME and E2E_PASSWORD.')

  await page.goto('/login')
  await page.getByLabel('Username').fill(username!)
  await page.getByLabel('Password').fill(password!)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).not.toHaveURL(/\/login$/)
})
