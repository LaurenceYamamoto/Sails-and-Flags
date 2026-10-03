import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
const metadata=JSON.parse(execFileSync('cargo',['metadata','--manifest-path','wasm-core/Cargo.toml','--format-version','1','--locked','--offline'],{encoding:'utf8'}));
const inventory=[];
for(const p of metadata.packages.filter(p=>p.source)){
 const root=path.dirname(p.manifest_path),target=path.join('assets/licenses',p.name+'-'+p.version);fs.mkdirSync(target,{recursive:true});
 const files=fs.readdirSync(root).filter(f=>/^LICENSE|^COPYING|^UNLICENSE/.test(f));
 for(const f of files)if(fs.statSync(path.join(root,f)).isFile())fs.copyFileSync(path.join(root,f),path.join(target,f));
 inventory.push({name:p.name,version:p.version,license:p.license,repository:p.repository,files});
}
fs.writeFileSync('assets/licenses/rust-crates.json',JSON.stringify(inventory,null,2)+'\n');
const sysroot=execFileSync('rustc',['--print','sysroot'],{encoding:'utf8'}).trim(),doc=path.join(sysroot,'share/doc/rust');
const copyright=fs.readFileSync(path.join(doc,'COPYRIGHT.html'),'utf8');
const intro=copyright.slice(0,copyright.indexOf('<h2 id="out-of-tree-dependencies">'));
const blocks=[...copyright.matchAll(/<h3>[\s\S]*?(?=<h3>|<\/body>)/g)].map(m=>m[0]).filter(s=>/In libstd:<\/b>\s+Yes/.test(s));
fs.writeFileSync('assets/licenses/rust-standard-library.html',intro+'<h2>Standard library dependency notices (all targets)</h2>'+blocks.join('\n')+'</body></html>');
fs.cpSync(path.join(doc,'licenses'),'assets/licenses/licenses',{recursive:true});
