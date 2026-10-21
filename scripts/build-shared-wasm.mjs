import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,readdirSync,mkdirSync,existsSync,copyFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';

// Pin the compiler because rebuilding std with atomics still needs nightly.
const toolchain='nightly-2026-04-15';
const profiling=process.env.WASM_PROFILE==='1';
const out=profiling?'sites/shared-profile':'assets/wasm/shared';
const flags=['-C','target-feature=+atomics,+bulk-memory','-C','link-arg=--shared-memory',
 '-C','link-arg=--max-memory=1073741824','-C','link-arg=--import-memory',
 ...['__wasm_init_tls','__tls_size','__tls_align','__tls_base'].flatMap(n=>['-C',`link-arg=--export=${n}`])].join(' ');
execFileSync('rustup',['run',toolchain,'cargo','build','--manifest-path','wasm-core/Cargo.toml',
 '--target','wasm32-unknown-unknown','--release','--locked','--features','shared-threads',
 '--target-dir','wasm-core/target/shared','-Z','build-std=panic_abort,std'],
 {stdio:'inherit',env:{...process.env,RUSTFLAGS:flags,...(profiling?{CARGO_PROFILE_RELEASE_STRIP:'none'}:{})}});
const local=path.resolve('wasm-core/target/tools/bin/wasm-bindgen'+(process.platform==='win32'?'.exe':''));
const cli=process.env.WASM_BINDGEN_CLI??(existsSync(local)?local:'wasm-bindgen');
const version=execFileSync(cli,['--version'],{encoding:'utf8'}).trim();
if(version!=='wasm-bindgen 0.2.129')throw Error('Install wasm-bindgen-cli 0.2.129');
mkdirSync(out,{recursive:true});
execFileSync(cli,['wasm-core/target/shared/wasm32-unknown-unknown/release/sails_flags_core.wasm',
 '--target','web','--out-dir',out,'--out-name','engine','--no-typescript'],{stdio:'inherit'});
const hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
const src=p=>createHash('sha256').update(readFileSync(p,'utf8').replace(/^\uFEFF/,'').replace(/\r\n/g,'\n')).digest('hex');
function files(dir){return readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(dir+'/'+e.name):[dir+'/'+e.name]);}
const bootstrap=files(out).find(p=>p.endsWith('/workerHelpers.no-bundler.js'));
if(!bootstrap)throw Error('Expected wasm-bindgen-rayon bootstrap not found');
copyFileSync('scripts/shared-worker-bootstrap.js',bootstrap);
const sources=['wasm-core/Cargo.toml','wasm-core/Cargo.lock','scripts/build-shared-wasm.mjs','scripts/shared-worker-bootstrap.js',
 ...files('wasm-core/src').filter(f=>f.endsWith('.rs')),...files('wasm-core/data').filter(f=>f.endsWith('.json'))].sort();
writeFileSync(profiling?'sites/shared-profile-build.json':'assets/wasm/shared-build.json',JSON.stringify({version:JSON.parse(readFileSync('package.json')).version,
 toolchain,bindgen:version,files:Object.fromEntries(files(out).sort().map(p=>[p,hash(p)])),
 sources:Object.fromEntries(sources.map(p=>[p,src(p)]))},null,2)+'\n');
