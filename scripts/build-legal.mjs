// Static legal pages work without JavaScript, Wasm, storage or a CDN.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {legalContent} from '../src/legal-content.js';
const root=fileURLToPath(new URL('../',import.meta.url));
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const write=(p,s)=>{fs.mkdirSync(path.dirname(path.join(root,p)),{recursive:true});fs.writeFileSync(path.join(root,p),s);};
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const link=(url,label)=>`<a href="${esc(url)}">${esc(label)}</a>`;
const crates=JSON.parse(read('assets/licenses/rust-crates.json'));
const text=(directory,file)=>`<details><summary>${esc(file)}</summary><pre>${esc(read(`${directory}/${file}`))}</pre></details>`;
const source='https://github.com/LaurenceYamamoto/Sails-and-Flags';
const version=JSON.parse(read('package.json')).version;
const c=legalContent;
for(const page of ['terms','licenses']){
 const common=`<p>© 2026 Laurence Yamamoto · ${esc(version)} · GPL-3.0-or-later</p><p>${link('../gpl-3.0.html',c.full+' — GPL v3')} · ${link(source,c.source)}</p>`;
 const terms=c.paragraphs.map((p,i)=>`<section><h2>${esc(c.headings[i])}</h2><p>${esc(p)}</p></section>`).join('');
 const oss=`<p>${esc(c.oss)}</p><h2>${esc(c.project)}</h2><p>${esc(c.notice)}</p>
 <h2>${esc(c.runtime)}</h2>${crates.map(p=>`<section><h3>${link(p.repository,p.name)} <small>${esc(p.version)}</small></h3><p>${esc(p.license)}</p>${p.files.map(f=>text(`assets/licenses/${p.name}-${p.version}`,f)).join('')}</section>`).join('')}
 <h2>${esc(c.standard)}</h2><p>Rust 1.95.0 · MIT OR Apache-2.0</p><p>${link('../../assets/licenses/rust-standard-library.html',c.standard)}</p>
 <h2>${esc(c.build)}</h2><h3>${link('https://github.com/nk2028/opencc-js','opencc-js')} 1.4.2 · MIT</h3>${text('assets/licenses/opencc-js-1.4.2','LICENSE')}
 <h3>${link('https://github.com/nk2028/opencc-data','opencc-data')} · Apache-2.0</h3>${text('assets/licenses/opencc-js-1.4.2','THIRD_PARTY_LICENSES.md')}${text('assets/licenses/opencc-js-1.4.2','Apache-2.0.txt')}
 <h2>${esc(c.map)}</h2><p>Made with Natural Earth · 1:50m Land v5.1.2 · Public Domain</p><p>${link('https://www.naturalearthdata.com/about/terms-of-use/', 'Natural Earth — Terms of Use')} · ${link('../../assets/maps/README.md','Natural Earth — Data provenance')}</p>`;
 write(`legal/en/${page}.html`,`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(c[page])} — Sails &amp; Flags</title><link rel="stylesheet" href="../legal.css"></head>
<body><header><a href="../../index.html">Sails &amp; Flags</a></header><main><h1>${esc(c[page])}</h1>${common}${page==='terms'?terms:oss}</main><footer>${link('terms.html',c.terms)} · ${link('licenses.html',c.licenses)}</footer></body></html>\n`);
}
write('legal/gpl-3.0.txt',read('LICENSE'));
write('legal/gpl-3.0.html', '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>GNU GPL v3 — Sails &amp; Flags</title><link rel="stylesheet" href="legal.css"></head><body><header><a href="../index.html">Sails &amp; Flags</a><a href="gpl-3.0.txt" download>Plain text</a></header><main><h1>GNU General Public License v3</h1><pre>'+esc(read('LICENSE'))+'</pre></main></body></html>\n');
console.log('Generated 2 English legal pages, the GPL reader and an unchanged GPL copy.');
