import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const dist = join(root, 'dist')
const entry = await readFile(join(dist, 'index.html'), 'utf8')
const script = entry.match(/<script\b[^>]+src="([^"]+)"[^>]*><\/script>/)
const style = entry.match(/<link\b[^>]+rel="stylesheet"[^>]+href="([^"]+)"[^>]*>/)
if (!script || !style) throw new Error('Vite did not output the expected script and stylesheet.')

const local = asset => join(dist, asset.replace(/^\//, ''))
const [js, css, license] = await Promise.all([
  readFile(local(script[1]), 'utf8'),
  readFile(local(style[1]), 'utf8'),
  readFile(join(root, 'src/font/OFL.txt'), 'utf8'),
])
const page = entry
  .replace(script[0], () => '<script type="module">\n' + js.replace(/<\/script/gi, '<\\/script') + '\n</script>')
  .replace(style[0], () => '<style>\n' + css + '\n</style>')
  .replace('</html>', '<!--\n' + license + '\n-->\n</html>')
const release = join(root, '약국 CCTV.html')
await writeFile(release, page, 'utf8')
console.log('오프라인 실행 파일 ' + release.slice(dirname(release).length + 1))
