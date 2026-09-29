import { cpSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const output = new URL('dist/', root);
mkdirSync(output, { recursive: true });
for (const path of ['tokens.css', 'styles']) {
  cpSync(fileURLToPath(new URL(path, root)), fileURLToPath(new URL(path, output)), { recursive: true });
}
cpSync(new URL('../../LICENSE', root), new URL('LICENSE', output));
