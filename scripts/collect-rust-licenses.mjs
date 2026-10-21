import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
const metadata=JSON.parse(execFileSync('cargo',['metadata','--manifest-path','wasm-core/Cargo.toml','--all-features','--format-version','1','--locked','--offline'],{encoding:'utf8'}));
const inventory=[];
for(const p of metadata.packages.filter(p=>p.source)){
 const root=path.dirname(p.manifest_path),target=path.join('assets/licenses',p.name+'-'+p.version);fs.mkdirSync(target,{recursive:true});
 const files=fs.readdirSync(root).filter(f=>/^LICENSE|^COPYING|^UNLICENSE/.test(f));
 for(const f of files)if(fs.statSync(path.join(root,f)).isFile())fs.copyFileSync(path.join(root,f),path.join(target,f));
 if(p.name==='wasm_sync'&&!files.length){
  // Upstream 0.1.2 declares MIT OR Apache-2.0 in Cargo.toml, but ships no
  // license files. Preserve that declaration and supply the Apache option.
  fs.copyFileSync(path.join(root,'Cargo.toml.orig'),path.join(target,'UPSTREAM-Cargo.toml'));
  fs.copyFileSync('assets/licenses/opencc-js-1.4.2/Apache-2.0.txt',path.join(target,'LICENSE-APACHE'));
  fs.writeFileSync(path.join(target,'NOTICE.txt'),'wasm_sync '+p.version+'\n'+p.repository+'\nUpstream declares MIT OR Apache-2.0. This distribution uses the Apache-2.0 option. The upstream crate ships no standalone license text; the included LICENSE-APACHE is the standard Apache License 2.0 text, supplied by this application. The original upstream license declaration is preserved in UPSTREAM-Cargo.toml.\n');
  files.push('NOTICE.txt','UPSTREAM-Cargo.toml','LICENSE-APACHE');
 }
 inventory.push({name:p.name,version:p.version,license:p.license,repository:p.repository,files});
}
fs.writeFileSync('assets/licenses/rust-crates.json',JSON.stringify(inventory,null,2)+'\n');
const sysroot=execFileSync('rustc',['--print','sysroot'],{encoding:'utf8'}).trim(),doc=path.join(sysroot,'share/doc/rust');
const copyright=fs.readFileSync(path.join(doc,'COPYRIGHT.html'),'utf8');
const intro=copyright.slice(0,copyright.indexOf('<h2 id="out-of-tree-dependencies">'));
const blocks=[...copyright.matchAll(/<h3>[\s\S]*?(?=<h3>|<\/body>)/g)].map(m=>m[0]).filter(s=>/In libstd:<\/b>\s+Yes/.test(s));
fs.writeFileSync('assets/licenses/rust-standard-library.html',intro+'<h2>Standard library dependency notices (all targets)</h2>'+blocks.join('\n')+'</body></html>');
fs.cpSync(path.join(doc,'licenses'),'assets/licenses/licenses',{recursive:true});
const threadedRoot=execFileSync('rustup',['run','nightly-2026-04-15','rustc','--print','sysroot'],{encoding:'utf8'}).trim();
const threadedDoc=path.join(threadedRoot,'share/doc/rust');
const threadedCopyright=fs.readFileSync(path.join(threadedDoc,'COPYRIGHT.html'),'utf8');
const threadedIntro=threadedCopyright.slice(0,threadedCopyright.indexOf('<h2 id="out-of-tree-dependencies">'));
const threadedBlocks=[...threadedCopyright.matchAll(/<h3>[\s\S]*?(?=<h3>|<\/body>)/g)].map(m=>m[0]).filter(s=>/In libstd:<\/b>\s+Yes/.test(s));
fs.mkdirSync('assets/licenses/threaded-rust',{recursive:true});
fs.writeFileSync('assets/licenses/threaded-rust/standard-library.html',threadedIntro+'<h2>Standard library dependency notices (all targets)</h2>'+threadedBlocks.join('\n')+'</body></html>');
fs.cpSync(path.join(threadedDoc,'licenses'),'assets/licenses/threaded-rust/licenses',{recursive:true});
