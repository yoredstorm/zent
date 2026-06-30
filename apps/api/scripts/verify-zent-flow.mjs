/**
 * Manual verification script for zent-flow integration.
 * Run: node scripts/verify-zent-flow.mjs
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const defaultConfig = JSON.parse(
  readFileSync(join(root, 'plugins', 'zent-flow', 'config', 'default.json'), 'utf8'),
);

const REQUIRED_ACTIONS = ['sendPdf', 'showCategories', 'showCart', 'handoff'];
const REQUIRED_ACTIONS = ['sendPdf', 'showCategories', 'showCart', 'handoff'];

let failed = 0;

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    failed++;
  } else {
    console.log('OK:', msg);
  }
}

assert(defaultConfig.greeting.includes('ZENT'), 'default greeting mentions ZENT');
assert(defaultConfig.startOnAnyMessage === true, 'startOnAnyMessage enabled');
for (const a of REQUIRED_ACTIONS) {
  assert(
    defaultConfig.options.some((o) => o.action === a),
    `menu action "${a}" configured`,
  );
}
assert(defaultConfig.zentApiUrl === 'http://backend-api:3000', 'zentApiUrl for Docker');

const zipPath = join(root, 'plugins', 'zent-flow.zip');
try {
  readFileSync(zipPath);
  console.log('OK: zent-flow.zip exists');
} catch {
  console.error('FAIL: run npm run package:zent-flow in plugins/ first');
  failed++;
}

console.log(failed === 0 ? '\nAll checks passed.' : `\n${failed} check(s) failed.`);
process.exit(failed === 0 ? 0 : 1);
