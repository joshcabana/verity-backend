import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const distAssets = path.resolve(process.cwd(), 'dist/assets');

if (!fs.existsSync(distAssets)) {
  console.error('Missing dist/assets. Run `npm run build` first.');
  process.exit(1);
}

const files = fs.readdirSync(distAssets);
const jsFiles = files.filter((file) => file.endsWith('.js'));
const cssFiles = files.filter((file) => file.endsWith('.css'));

function bytesFor(filePath) {
  const buffer = fs.readFileSync(filePath);
  return {
    raw: buffer.length,
    gzip: zlib.gzipSync(buffer).length,
  };
}

const jsStats = jsFiles.map((file) => ({
  file,
  ...bytesFor(path.join(distAssets, file)),
}));
const cssStats = cssFiles.map((file) => ({
  file,
  ...bytesFor(path.join(distAssets, file)),
}));

const mainEntry = jsStats.find((stat) => stat.file.startsWith('index-'));
const socketChunk = jsStats.find((stat) => stat.file.startsWith('useSocket-'));
const totalJsRaw = jsStats.reduce((sum, stat) => sum + stat.raw, 0);
const totalJsGzip = jsStats.reduce((sum, stat) => sum + stat.gzip, 0);
const totalCssRaw = cssStats.reduce((sum, stat) => sum + stat.raw, 0);

const budgets = [
  {
    label: 'Main entry raw',
    actual: mainEntry?.raw ?? Number.POSITIVE_INFINITY,
    max: 260 * 1024,
  },
  {
    label: 'Main entry gzip',
    actual: mainEntry?.gzip ?? Number.POSITIVE_INFINITY,
    max: 80 * 1024,
  },
  {
    label: 'Socket chunk raw',
    actual: socketChunk?.raw ?? Number.POSITIVE_INFINITY,
    max: 50 * 1024,
  },
  {
    label: 'Total JS raw',
    actual: totalJsRaw,
    max: 420 * 1024,
  },
  {
    label: 'Total JS gzip',
    actual: totalJsGzip,
    max: 140 * 1024,
  },
  {
    label: 'Total CSS raw',
    actual: totalCssRaw,
    max: 12 * 1024,
  },
];

const failed = budgets.filter((budget) => budget.actual > budget.max);

for (const budget of budgets) {
  const status = budget.actual <= budget.max ? 'OK' : 'FAIL';
  console.log(
    `${status} ${budget.label}: ${(budget.actual / 1024).toFixed(2)}kB <= ${(budget.max / 1024).toFixed(2)}kB`,
  );
}

if (failed.length > 0) {
  console.error('\nBundle budgets exceeded.');
  process.exit(1);
}
