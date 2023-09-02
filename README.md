# MinZip

![node test](https://github.com/firien/minzip/actions/workflows/node.js.yml/badge.svg?event=push)
![browser test](https://github.com/firien/minzip/actions/workflows/playwright.yml/badge.svg?event=push)

Minimalistic zip file generator using native APIs. Minified code is ~3kb.

Works in browsers (Chrome >80, Firefox >113, Safari >16.4) and node (> v18)

Required APIs

* CompressionStream
* ArrayBuffer
* DataView
* TextEncoder
* Response
* Blob

Example
```js
import MinZip from 'minzip'
const zip = new MinZip()
const blob = new Blob(['hello world'], { type: 'text/plain' })
await zip.addFile('one.txt', blob)
const zipBlob = await zip.write()
```

## Caveats

Very new and relatively untested. Files seem very straight forward, but the Folders are a little fuzzy at this point.

## Resources

* https://en.wikipedia.org/wiki/ZIP_(file_format)
* https://en.wikipedia.org/wiki/Gzip
* https://www.rfc-editor.org/rfc/rfc1952

