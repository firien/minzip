import assert from 'node:assert/strict'
import { execSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import MinZip from '../../index.js'

test('zip me up', async () => {
  const zip = new MinZip()
  const blob = new Blob(['hello world'], { type: 'text/plain' })
  await zip.addFile('one.txt', blob)

  const blob2 = new Blob(['zipped'], { type: 'text/plain' })
  await zip.addFile('two.txt', blob2)

  const zipBlob = await zip.write()
  const buffer = await zipBlob.arrayBuffer()
  const dv = new DataView(buffer)
  const zipFile = join(tmpdir(), 'test.zip')
  writeFileSync(zipFile, dv)
  assert.doesNotThrow(() => {
    execSync(`unzip -t ${zipFile}`, { encoding: 'utf8' })
  })
})

test('zip with folder', async () => {
  const zip = new MinZip()
  const folder = zip.addFolder('test')
  const folder2 = folder.addFolder('ext')

  const blob2 = new Blob(['zipped'], { type: 'text/plain' })
  await folder2.addFile('two.txt', blob2)

  const zipBlob = await zip.write()
  const buffer = await zipBlob.arrayBuffer()
  const dv = new DataView(buffer)
  writeFileSync('/tmp/tast.zip', dv)
})
