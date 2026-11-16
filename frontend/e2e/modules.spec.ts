import { expect, test } from '@playwright/test'

test('core business modules are available to the configured local user', async ({ page }) => {
  const username = process.env.E2E_USERNAME
  const password = process.env.E2E_PASSWORD
  test.skip(!username || !password, 'Provide local test credentials through E2E_USERNAME and E2E_PASSWORD.')

  await page.goto('/login')
  await page.getByLabel('Username').fill(username!)
  await page.getByLabel('Password').fill(password!)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).not.toHaveURL(/\/login$/)

  const modules = [
    ['/pipeline', 'Pipeline'],
    ['/enquiries', 'Enquiries'],
    ['/quotations', 'Quotations'],
    ['/suppliers', 'Suppliers'],
    ['/finance', 'Finance'],
    ['/in-jobs', 'In Jobs'],
    ['/out-jobs', 'Out Jobs'],
    ['/deliveries', 'Deliveries'],
    ['/customer-payments', 'Customer Payments'],
    ['/vendor-payments', 'Vendor Payments'],
    ['/cash-transactions', 'Cash Book'],
    ['/cash-transfers', 'Cash Transfers'],
  ] as const

  for (const [path, title] of modules) {
    await page.goto(path)
    await expect(page.getByRole('heading', { name: title, exact: true }), `${path} should be accessible`).toBeVisible()
  }
})

test('enquiry CRUD and conversion to a pipeline job', async ({ page }) => {
  const username = process.env.E2E_USERNAME
  const password = process.env.E2E_PASSWORD
  test.skip(!username || !password, 'Provide local test credentials through E2E_USERNAME and E2E_PASSWORD.')

  await page.goto('/login')
  await page.getByLabel('Username').fill(username!)
  await page.getByLabel('Password').fill(password!)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).not.toHaveURL(/\/login$/)

  const originalName = `Playwright enquiry ${Date.now()}`
  const editedName = `${originalName} edited`
  let createdId: number | undefined
  let pipelineId: number | undefined
  let disposableId: number | undefined
  try {
    await page.goto('/enquiries/new')
    await page.getByLabel('Enquiry date').fill('2026-10-22')
    await page.getByLabel('Customer name').fill(originalName)
    await page.getByLabel('Contact number').fill('9000000000')
    await page.getByLabel('Job type').fill('Business cards')
    await page.getByLabel('Size').fill('A5')
    await page.getByLabel('Quantity').fill('100')
    await page.getByLabel('Printing method').fill('Digital')
    await page.getByLabel('Quote').fill('Sample price details')

    const createdResponse = page.waitForResponse(response => response.url().includes('/api/enquiries/') && response.request().method() === 'POST')
    await page.getByRole('button', { name: 'Save' }).click()
    const response = await createdResponse
    expect(response.ok(), await response.text()).toBeTruthy()
    createdId = (await response.json()).id

    let enquiryRow = page.getByRole('row').filter({ hasText: originalName })
    await expect(enquiryRow).toBeVisible()
    await enquiryRow.getByLabel('Edit').click()
    await page.getByLabel('Customer name').fill(editedName)
    await page.getByRole('button', { name: 'Save' }).click()
    enquiryRow = page.getByRole('row').filter({ hasText: editedName })
    await expect(enquiryRow).toBeVisible()

    await enquiryRow.getByRole('button', { name: 'Convert to pipeline job' }).click()
    await expect(page.getByLabel('Client name')).toHaveValue(editedName)
    await expect(page.getByLabel('Job type')).toHaveValue('Business cards')
    const pipelineResponsePromise = page.waitForResponse(response => response.url().includes('/api/pipeline-jobs/') && response.request().method() === 'POST')
    await page.getByRole('button', { name: 'Save' }).click()
    const pipelineResponse = await pipelineResponsePromise
    expect(pipelineResponse.ok(), await pipelineResponse.text()).toBeTruthy()
    pipelineId = (await pipelineResponse.json()).id
    await expect(page).toHaveURL(/\/pipeline$/)
    await expect(page.getByRole('row').filter({ hasText: editedName })).toBeVisible()

    const token = await page.evaluate(() => localStorage.getItem('libin_auth_token'))
    expect(token).toBeTruthy()
    const enquiryResponse = await page.request.get(`/api/enquiries/${createdId}/`, { headers: { Authorization: `Token ${token}` } })
    expect(enquiryResponse.ok()).toBeTruthy()
    const enquiry = await enquiryResponse.json()
    expect(enquiry.converted_pipeline_jobs).toContainEqual(expect.objectContaining({ id: pipelineId }))

    const disposableName = `${originalName} disposable`
    await page.goto('/enquiries/new')
    await page.getByLabel('Enquiry date').fill('2026-10-22')
    await page.getByLabel('Customer name').fill(disposableName)
    const disposableResponsePromise = page.waitForResponse(response => response.url().includes('/api/enquiries/') && response.request().method() === 'POST')
    await page.getByRole('button', { name: 'Save' }).click()
    const disposableResponse = await disposableResponsePromise
    expect(disposableResponse.ok(), await disposableResponse.text()).toBeTruthy()
    disposableId = (await disposableResponse.json()).id
    const disposableRow = page.getByRole('row').filter({ hasText: disposableName })
    await expect(disposableRow).toBeVisible()
    page.once('dialog', dialog => dialog.accept())
    await disposableRow.getByRole('button', { name: 'Delete enquiry' }).click()
    await expect(page.getByRole('row').filter({ hasText: disposableName })).toHaveCount(0)
    disposableId = undefined
  } finally {
    if (disposableId || (createdId && !pipelineId)) {
      const token = await page.evaluate(() => localStorage.getItem('libin_auth_token'))
      if (token && disposableId) await page.request.delete(`/api/enquiries/${disposableId}/`, { headers: { Authorization: `Token ${token}` } })
      if (token && createdId && !pipelineId) await page.request.delete(`/api/enquiries/${createdId}/`, { headers: { Authorization: `Token ${token}` } })
    }
  }
})
