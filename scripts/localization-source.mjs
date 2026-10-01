import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {en} from '../src/i18n.js';

// Extract only string literals from our trusted source, never from saves or user text.
// Dynamic messages must use placeholders rather than constructing translation keys.
export function sourceMessages() {
  const root=new URL('../src/',import.meta.url), messages=new Set(Object.values(en));
  const literal=String.raw`(?:'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*")`;
  const decode=value=>Function('return '+value)();
  const calls=new RegExp('tx\\(\\s*('+literal+')\\s*,\\s*('+literal+')','g');
  const pairs=new RegExp('\\[\\s*('+literal+')\\s*,\\s*('+literal+')\\s*\\]','g');
  for(const file of fs.readdirSync(root).filter(f=>f.endsWith('.js')&&!f.startsWith('translation'))) {
    const source=fs.readFileSync(new URL(file,root),'utf8');
    for(const m of source.matchAll(calls)) messages.add(decode(m[2]));
    for(const m of source.matchAll(pairs)) if(/[\u3000-\u9fff]/.test(decode(m[1]))) messages.add(decode(m[2]));
    if(file==='i18n.js') {
      const errors=source.slice(source.indexOf('const messages ='));
      const entries=new RegExp('('+literal+')\\s*:\\s*('+literal+')','g');
      for(const m of errors.matchAll(entries)) messages.add(decode(m[2]));
    }
    if(/tx\(\s*`/.test(source)) throw Error(`Use placeholders for translated templates: ${fileURLToPath(new URL(file,root))}`);
  }
  return [...messages];
}
