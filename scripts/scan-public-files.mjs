import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, relative } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const ignored = new Set(['.git', '.work', 'evidence', 'node_modules']);
const detectors = [
  { id: 'GITHUB_TOKEN', pattern: /gh[pousr]_[A-Za-z0-9]{20,}/ },
  { id: 'GITHUB_FINE_GRAINED_TOKEN', pattern: /github_pat_[A-Za-z0-9_]{20,}/ },
  { id: 'AWS_ACCESS_KEY_ID', pattern: /AKIA[A-Z0-9]{16}/ },
  { id: 'OPENAI_STYLE_TOKEN', pattern: /(?<![A-Za-z0-9])sk-(?:(?:proj|svcacct)-[A-Za-z0-9_-]{20,}|[A-Za-z0-9_]{20,})/ },
  { id: 'PRIVATE_KEY', pattern: /-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----/ },
  { id: 'CREDENTIAL_ASSIGNMENT', pattern: /(?:api[_-]?key|secret|password|access[_-]?token)\s*[=:]\s*["'][^"'\s]{8,}["']/i },
  { id: 'AUTHORIZATION_HEADER', pattern: /authorization["']?\s*[:=]\s*["']?(?:bearer|basic)\s+[A-Za-z0-9._~+/=-]{16,}/i },
  { id: 'ABSOLUTE_UNIX_PATH', pattern: /\/(?:Users|home)\/[^/\s]+\// },
  { id: 'ABSOLUTE_WINDOWS_PATH', pattern: /[A-Z]:\\Users\\/ },
  { id: 'PRODUCTION_PROJECT_REFERENCE', pattern: /cloudbase|tencentcloud|WECHAT_APP|miniprogram-3/i },
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
    const detector = detectors.find(({ pattern }) => pattern.test(text));
    if (detector) findings.push({ file: name, reason: 'SENSITIVE_PATTERN', detector: detector.id });
  }
}
await scan(root);
console.log(JSON.stringify({ gate: findings.length ? 'FAIL' : 'PASS', scanned, findings }));
if (findings.length) process.exitCode = 1;
