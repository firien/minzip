export class Entry {
  static #localFileHeaderLength = 30
  static #centralDirectoryFileHeaderLength = 46

  static addFolder (name) {
    const folder = new Entry()
    folder.timeStamp = new Date()
    folder.name = `${name}/`
    folder.uncompressedByteSize = 0
    folder.compressedByteSize = 0
    folder.crc32 = 0
    folder.compressionMethod = 0
    folder.externalFileAttributes = 0x0000ED41
    const utf8Encode = new TextEncoder()
    folder.encodedName = utf8Encode.encode(folder.name)
    return folder
  }

  static async addFile (name, blob) {
    const file = new Entry()
    file.timeStamp = new Date()
    file.name = name
    file.uncompressedByteSize = blob.size
    // gzip will include DEFLATE compression and crc32 checksum
    const gzip = new CompressionStream('gzip')
    const compressedStream = blob.stream().pipeThrough(gzip)
    const buffer = await new Response(compressedStream).arrayBuffer()
    const headerBytes = 10
    const trailingBytes = 8
    file.compressedByteSize = buffer.byteLength - headerBytes - trailingBytes
    file.compressionMethod = 0x0800
    file.externalFileAttributes = 0x0000A481
    const dataView = new DataView(buffer, buffer.byteLength - trailingBytes, trailingBytes)
    // extract crc32 checksum
    file.crc32 = dataView.getUint32(0)
    // dataView.getUint32(4, true) also uncompressedByteSize
    file.compressedData = buffer.slice(headerBytes, buffer.byteLength - trailingBytes)
    const utf8Encode = new TextEncoder()
    file.encodedName = utf8Encode.encode(file.name)
    return file
  }

  /**
   * Generate localFileHeader
   * @return {Blob}
   */
  localFileHeader ({ stream = false } = {}) {
    const buffer = new ArrayBuffer(this.constructor.#localFileHeaderLength)
    const dv = new DataView(buffer)
    dv.setUint32(0, 0x04034b50, true) // Local file header signature
    dv.setUint16(4, 0x1400) // Version needed to extract (minimum)
    let genFlag = 0b100000000000
    if (stream) {
      genFlag |= 0b1000
    }
    dv.setUint16(6, genFlag, true) // General purpose bit flag
    this.commonHeaders(dv, 8)
    dv.setUint16(28, 0, true) // Extra field length
    return new Blob([buffer, this.encodedName])
  }

  /**
   * Generate centralDirectoryFileHeader
   * @return {Blob}
   */
  centralDirectoryFileHeader () {
    const buffer = new ArrayBuffer(this.constructor.#centralDirectoryFileHeaderLength)
    const dv = new DataView(buffer)
    dv.setUint32(0, 0x02014b50, true) // Central directory file header signature
    dv.setUint16(4, 0x1404) // Version made by
    dv.setUint16(6, 0x1400) // Version needed to extract (minimum)
    dv.setUint16(8, 0b100000000000, true) // General purpose bit flag
    this.commonHeaders(dv, 10)
    dv.setUint16(30, 0, true) // Extra field length
    dv.setUint16(32, 0, true) // File comment length
    dv.setUint16(34, 0, true) // Disk number where file starts
    dv.setUint16(36, 0, true) // Internal file attributes
    dv.setUint32(38, this.externalFileAttributes) // External file attributes
    dv.setUint32(42, this.localFileHeaderOffset, true) // Relative offset of local file header
    return new Blob([buffer, this.encodedName])
  }

  commonHeaders (dv, offsetStart) {
    dv.setUint16(offsetStart, this.compressionMethod) // Compression method
    dv.setUint16(offsetStart + 2, this.timeWord, true) // File last modification time
    dv.setUint16(offsetStart + 4, this.dateWord, true) // File last modification date
    dv.setUint32(offsetStart + 6, this.crc32) // CRC-32 of uncompressed data
    dv.setUint32(offsetStart + 10, this.compressedByteSize, true) // Compressed size
    dv.setUint32(offsetStart + 14, this.uncompressedByteSize, true) // Uncompressed size
    dv.setUint16(offsetStart + 18, this.encodedName.length, true) // File name length
  }

  get dateWord () {
    const year = this.timeStamp.getFullYear() - 1980
    const month = this.timeStamp.getMonth() + 1
    const day = this.timeStamp.getDate()
    return (year << 9) + (month << 5) + day
  }

  get timeWord () {
    const hours = this.timeStamp.getHours()
    const minutes = this.timeStamp.getMinutes()
    const seconds = Math.floor(this.timeStamp.getSeconds() / 2)
    return (hours << 11) + (minutes << 5) + seconds
  }
}

export default class {
  static #endOfCentralDirectoryRecordLength = 22

  constructor () {
    this.entries = []
  }

  /**
   * Add file to zip
   * @param {string} name name of file
   * @param {Blob} blob data
   * @return {Entry}
   */
  async addFile (name, blob) {
    const file = await Entry.addFile(name, blob)
    this.entries.push(file)
    return file
  }

  /**
   * Add folder to zip
   * @param {string} name name of folder
   * @return {Entry}
   */
  addFolder (name) {
    const folder = Entry.addFolder(name)
    this.entries.push(folder)
    const scope = {
      addFile: (childName, childBlob) => {
        return this.addFile(`${name}/${childName}`, childBlob)
      },
      addFolder: (childName) => {
        return this.addFolder(`${name}/${childName}`)
      }
    }
    return Object.assign(folder, scope)
  }

  /**
   * Generate endOfCentralDirectoryRecord
   * @return {ArrayBuffer}
   */
  endOfCentralDirectoryRecord () {
    const buffer = new ArrayBuffer(this.constructor.#endOfCentralDirectoryRecordLength)
    const dv = new DataView(buffer)
    dv.setUint32(0, 0x06054b50, true) // End of central directory signature
    dv.setUint16(4, 0, true) // Number of this disk
    dv.setUint16(6, 0, true) // Disk where central directory starts
    dv.setUint16(8, this.entries.length, true) // Number of central directory records on this disk
    dv.setUint16(10, this.entries.length, true) // Total number of central directory records
    dv.setUint32(12, this.centralDirectorySize, true) // Size of central directory
    dv.setUint32(16, this.centralDirectoryOffset, true) // Offset of start of central directory
    dv.setUint16(20, 0) // Comment length
    return buffer
  }

  /**
   * Get the zip blob
   * @param {boolean} [purge=true] remove compressed data after write
   * @return {Promise} Resolves to zip blob
   */
  async write (purge = true) {
    const blobs = []
    let totalBytes = 0
    for (const file of this.entries) {
      const localFileHeader = await file.localFileHeader()
      file.localFileHeaderOffset = totalBytes
      blobs.push(localFileHeader)
      totalBytes += localFileHeader.size
      if (file.compressedData) {
        blobs.push(file.compressedData)
        totalBytes += file.compressedData.byteLength
        if (purge) {
          delete file.compressedData
        }
      }
    }
    this.centralDirectoryOffset = totalBytes
    let centralDirectorySize = 0
    for (const file of this.entries) {
      const centralDirectoryFileHeader = await file.centralDirectoryFileHeader()
      blobs.push(centralDirectoryFileHeader)
      centralDirectorySize += centralDirectoryFileHeader.size
    }
    this.centralDirectorySize = centralDirectorySize
    blobs.push(this.endOfCentralDirectoryRecord())
    return new Blob(blobs, { type: 'application/zip' })
  }
}

/**
* Generate endOfCentralDirectoryRecord
* @return {ArrayBuffer}
*/
export const endOfCentralDirectoryRecord = (entriesCount, size, offset) => {
  const buffer = new ArrayBuffer(22)
  const dv = new DataView(buffer)
  dv.setUint32(0, 0x06054b50, true) // End of central directory signature
  dv.setUint16(4, 0) // Number of this disk
  dv.setUint16(6, 0) // Disk where central directory starts
  dv.setUint16(8, entriesCount, true) // Number of central directory records on this disk
  dv.setUint16(10, entriesCount, true) // Total number of central directory records
  dv.setUint32(12, size, true) // Size of central directory
  dv.setUint32(16, offset, true) // Offset of start of central directory
  dv.setUint16(20, 0) // Comment length
  return buffer
}
