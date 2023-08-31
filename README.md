# MinZip

Minimalistic zip file generator using native APIs. Minified code is ~3kb.

Works in browsers (Chrome >80, Firefox >113, Safari >16.4) and node (> v18)

Required APIs

* CompressionStream
* ArrayBuffer
* DataView
* TextEncoder
* Response
* Blob

## Caveats

Very new and untested. Files seem very straight forward, but the Folders are a little fuzzy at this point.

## Resources

* https://en.wikipedia.org/wiki/ZIP_(file_format)
* https://en.wikipedia.org/wiki/Gzip
* https://www.rfc-editor.org/rfc/rfc1952


npx esbuild ./index.js --bundle --format=esm --minify | wc -c
npx esbuild ./index.js --bundle --format=esm --minify --mangle-props='(Size|Method|Offset|Record|Data|Header|Word)$' | wc -c