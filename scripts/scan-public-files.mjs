import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, relative } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const ignored = new Set(['.git', '.work', 'evidence', 'node_modules']);
const patterns = [
  /gh[pousr]_[A-Za-z0-9]{20,}/, /github_pat_[A-Za-z0-9_]{20,}/,
  /AKIA[A-Z0-9]{16}/, /sk-[A-Za-z0-9_-]{20,}/,
  /-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----/,
  /(?:api[_-]?key|secret|password|access[_-]?token)\s*[=:]\s*["'][^"'\s]{8,}["']/i,
  /\/(?:Users|home)\/[^/\s]+\//, /[A-Z]:\\Users\\/,
  /cloudbase|tencentcloud|WECHAT_APP|miniprogram-3/i,
];
const findings = [];
let scanned = 0;
async function scan(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const path = resolve(dir, entry.name), name = relative(root, path);
    if (entry.isSymbolicLink()) { findings.push({ file: name, reason: 'SYMLINK' }); continue; }
    if (/^\.env(?:\.|$)|\.(pem|key|p12)$/i.test(entry.name)) { findings.push({ file: name, reason: 'FORBIDDEN_FILE' }); continue; }
    if (entry.isDirectory()) { await scan(path); continue; }
    scanned++;
    // This scanner contains detection expressions, not configuration values.
    if (name === 'scripts/scan-public-files.mjs') continue;
    const text = await readFile(path, 'utf8');
    if (patterns.some(pattern => pattern.test(text))) findings.push({ file: name, reason: 'SENSITIVE_PATTERN' });
  }
}
await scan(root);
console.log(JSON.stringify({ gate: findings.length ? 'FAIL' : 'PASS', scanned, findings }));
if (findings.length) process.exitCode = 1;
