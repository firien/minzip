import { test, expect } from '@playwright/test'
import testConfig from '../../playwright.config.js'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { execSync } from 'node:child_process'

test('download zip', async ({ page }) => {
  await page.goto(`http://localhost:${testConfig.webServer.port}/`)
  const download = await page.waitForEvent('download')
  // wait for download to complete
  const zipFile = join(tmpdir(), 'test.zip')
  await download.saveAs(zipFile)
  expect(() => {
    execSync(`unzip -t ${zipFile}`, { encoding: 'utf8' })
  }).not.toThrow()
})
