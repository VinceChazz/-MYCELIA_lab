// Enumerate the complete built shell including lazy routes and bundled font files.
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, relative } from 'node:path';

const root = new URL('../dist', import.meta.url).pathname;
async function walk(dir) {
  const results = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) results.push(...await walk(path));
    else if (!entry.name.endsWith('.map') && entry.name !== 'precache.json' && entry.name !== 'sw.js')
      results.push('/' + relative(root, path).split('\\').join('/'));
  }
  return results;
}
const files = await walk(root);
await writeFile(join(root, 'precache.json'), JSON.stringify({ assets: ['/', ...files.filter(path => path !== '/index.html')] }));
const buildId = createHash('sha256').update(JSON.stringify(files)).digest('hex').slice(0,10);
const worker = (await readFile(join(root, 'sw.js'), 'utf8')).replace('__BUILD_ID__', buildId);
await writeFile(join(root, 'sw.js'), worker);
console.log(`Prepared ${files.length} offline assets (including every lazy module); cache ${buildId}.`);
