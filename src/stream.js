import { createReadStream, createWriteStream, statSync, existsSync } from 'node:fs'
import { readdir } from 'node:fs/promises'
import { ReadableStream } from 'node:stream/web'
import { resolve, join, dirname } from 'node:path'
import { Entry, endOfCentralDirectoryRecord } from './zip.js'

export default class ZipStream {
  constructor (file) {
    this.zip = createWriteStream(file)
    this.entries = []
  }

  async addFolder (dir) {
    if (existsSync(dir)) {
      const stats = statSync(dir)
      if (stats.isDirectory()) {
        const folder = new Entry()
        folder.timeStamp = stats.mtime ?? new Date()
        folder.uncompressedByteSize = 0
        folder.compressedByteSize = 0
        folder.crc32 = 0
        folder.compressionMethod = 0
        folder.localFileHeaderOffset = this.zip.bytesWritten
        folder.externalFileAttributes = 0x0000ED41
        const utf8Encode = new TextEncoder()
        folder.encodedName = utf8Encode.encode(`${dir}/`)
        // write folder
        const localFileHeader = folder.localFileHeader()
        const aa = await localFileHeader.arrayBuffer()
        const ab = new Uint8Array(aa)
        await new Promise((resolve, reject) => {
          this.zip.write(ab, resolve)
        })
        this.entries.push(folder)
        const files = await readdir(dir, { withFileTypes: true })
        for (const file of files) {
          const path = join(file.path, file.name)
          if (file.isDirectory()) {
            await this.addFolder(path)
          } else {
            await this.addFile(path)
          }
        }
      }
    }
  }

  async addFile (path) {
    const file = new Entry()
    const stats = statSync(path)
    file.timeStamp = stats.mtime ?? new Date()
    file.compressionMethod = 0x0800
    file.externalFileAttributes = 0x0000A481
    const utf8Encode = new TextEncoder()
    file.encodedName = utf8Encode.encode(path)
    // unknown data
    file.crc32 = 0
    file.uncompressedByteSize = 0
    file.compressedByteSize = 0
    file.localFileHeaderOffset = this.zip.bytesWritten

    const localFileHeader = file.localFileHeader({ stream: true })
    const aa = await localFileHeader.arrayBuffer()
    const ab = new Uint8Array(aa)
    await new Promise((resolve, reject) => {
      this.zip.write(ab, resolve)
    })

    const stream = createReadStream(path)
    const gzip = new CompressionStream('gzip')
    const compressedStream = ReadableStream.from(stream).pipeThrough(gzip)

    let header
    let previousChunk

    const headerBytes = 10
    const trailingBytes = 8

    // get chunks from gzip
    const start = this.zip.bytesWritten
    for await (const chunk of compressedStream) {
      if (previousChunk) {
        await new Promise((resolve, reject) => {
          this.zip.write(previousChunk, resolve)
        })
      }
      if (!header) {
        header = chunk.slice(0, headerBytes)
        if (chunk.length > headerBytes) {
          previousChunk = chunk.subarray(headerBytes)
        }
      } else {
        previousChunk = chunk
      }
    }
    file.uncompressedByteSize = stats.size
    const footer = previousChunk.slice(-trailingBytes)
    const dataView = new DataView(footer.buffer)
    // extract crc32 checksum
    file.crc32 = dataView.getUint32(0)
    // write last chunk of compressed file
    await new Promise((resolve, reject) => {
      this.zip.write(previousChunk.subarray(0, previousChunk.length - trailingBytes), resolve)
    })
    file.compressedByteSize = this.zip.bytesWritten - start

    // Data descriptor
    const buffer = new ArrayBuffer(16)
    const dv = new DataView(buffer)
    dv.setUint32(0, 0x08074b50, true) // Local file header signature
    dv.setUint32(4, file.crc32) // Version needed to extract (minimum)
    dv.setUint32(8, file.compressedByteSize, true) // Compressed size
    dv.setUint32(12, file.uncompressedByteSize, true) // Uncompressed size
    // write the data desscriptor
    await new Promise((resolve, reject) => {
      const cc = new Uint8Array(buffer)
      this.zip.write(cc, resolve)
    })
    this.entries.push(file)
  }

  async close () {
    // write central directories
    const centralDirectoryOffset = this.zip.bytesWritten
    for (const entry of this.entries) {
      const aa = await entry.centralDirectoryFileHeader().arrayBuffer()
      const ab = new Uint8Array(aa)
      await new Promise((resolve, reject) => {
        this.zip.write(ab, resolve)
      })
    }
    const centralDirectorySize = this.zip.bytesWritten - centralDirectoryOffset
    await new Promise((resolve, reject) => {
      const bb = new Uint8Array(endOfCentralDirectoryRecord(this.entries.length, centralDirectorySize, centralDirectoryOffset))
      this.zip.write(bb, resolve)
    })
    this.zip.close()
  }
}
