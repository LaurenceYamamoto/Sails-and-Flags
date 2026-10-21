//! Shared-memory execution policy. JS boots workers once; no game jobs or
//! results leave Rust. Indexed collection preserves the serial commit order.
use serde_json::{Value, json};

#[derive(Clone, Copy)]
pub(crate) enum Kind { Movement, Cities, Investments, Schedules, Rival }

// A single slow first measurement can include compilation or interruption.
// Probe only after two real serial batches justify waking the pool.
#[cfg(feature="shared-threads")]
fn probe_worthwhile(previous:f64,current:f64)->bool {
    previous>=0.1 && current>=0.1
}

#[cfg(feature="shared-threads")]
mod shared {
    use super::*;
    use rayon::prelude::*;
    use std::cell::RefCell;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use wasm_bindgen::prelude::*;
    static WORKERS:AtomicUsize=AtomicUsize::new(0);
    #[wasm_bindgen]
    extern "C" {
        #[wasm_bindgen(js_namespace=performance, js_name=now)]
        fn now()->f64;
    }
    #[derive(Clone, Copy, Default)]
    struct Sample { weight:usize, parallel:bool, calls:usize, batches:usize, items:usize, serial_ms:f64, parallel_ms:f64, measurements:usize, probes:usize }
    struct Policy { mode:u32, samples:[Sample;5] }
    thread_local! { static POLICY:RefCell<Policy>=const {RefCell::new(Policy{mode:0,samples:[Sample{weight:0,parallel:false,calls:0,batches:0,items:0,serial_ms:0.0,parallel_ms:0.0,measurements:0,probes:0};5]})}; }

    pub fn enabled(n:usize) { WORKERS.store(n,Ordering::Release); }
    pub fn configure(mode:u32) { POLICY.with(|p|*p.borrow_mut()=Policy{mode,samples:[Sample::default();5]}); }
    pub fn status()->Value {
        POLICY.with(|p| {let p=p.borrow();json!({"workers":WORKERS.load(Ordering::Acquire),"mode":p.mode,
            "kinds":(["movement","cities","investments","schedules","rival"].iter().zip(p.samples).map(|(name,s)|
                json!({"kind":name,"batches":s.batches,"items":s.items,"parallel":s.parallel,
                    "serialMs":s.serial_ms,"parallelMs":s.parallel_ms,"measurements":s.measurements,"probes":s.probes})).collect::<Vec<_>>())})})
    }
    pub fn map<T:Sync,R:Send,F:Fn(&T)->R+Sync+Send>(kind:Kind,items:&[T],weight:usize,f:F)->Vec<R> {
        let workers=WORKERS.load(Ordering::Acquire);
        if workers==0||items.len()<2{return items.iter().map(f).collect();}
        let floor=match kind{Kind::Movement=>256,Kind::Cities=>32,Kind::Investments=>32,Kind::Schedules=>256,Kind::Rival=>64};
        // Decide and advance the counter under one borrow. Do not copy the
        // whole diagnostic record on every hot-path batch.
        let (mode,use_parallel,calibrate,previous_ms,previous_weight)=POLICY.with(|p|{
            let mut p=p.borrow_mut();let mode=p.mode;
            if mode==1||(mode==0&&weight<floor){return (mode,false,false,0.0,0);}
            let s=&mut p.samples[kind as usize];
            let interval=if s.serial_ms<0.1{1024}else{256};
            let calibrate=mode==0&&(s.weight==0||weight>=s.weight.saturating_mul(2)||s.calls>=interval
                ||(s.measurements==1&&s.serial_ms>=0.1));
            if !calibrate{s.calls+=1;}
            (mode,s.parallel,calibrate,s.serial_ms,s.weight)
        });
        if !calibrate&&mode!=2&&!use_parallel{return items.iter().map(f).collect();}
        // Kernels are short: do not create many tiny stealable tasks per core.
        let parallel=||items.par_iter().with_min_len(items.len().div_ceil(workers)).map(&f).collect::<Vec<R>>();
        if calibrate {
            // Keep the serial result: no disposable warm-up computations.
            // First use commits this batch and gathers evidence for later calls.
            let t=now();let serial=items.iter().map(&f).collect::<Vec<R>>();let serial_ms=now()-t;
            let (rows,parallel_ms)=if probe_worthwhile(previous_ms,serial_ms) {
                let t=now();let rows=parallel();(Some(rows),now()-t)
            }else{(None,0.0)};
            let faster=rows.is_some()&&parallel_ms<serial_ms*0.7;
            POLICY.with(|p|{let mut p=p.borrow_mut();let s=&mut p.samples[kind as usize];
                s.weight=weight;s.parallel=faster;s.calls=0;s.batches+=1;s.items+=items.len();s.serial_ms=serial_ms;s.parallel_ms=parallel_ms;
                s.measurements+=1;if rows.is_some(){s.probes+=1;}});
            return if faster{rows.unwrap()}else{serial};
        }
        if mode==2||use_parallel {
            let t=now();
            let rows=parallel();
            let elapsed=now()-t;
            POLICY.with(|p|{let mut p=p.borrow_mut();let s=&mut p.samples[kind as usize];s.batches+=1;s.items+=items.len();
                // Detect changing task shape between calibrations. Keep the
                // already-computed result; only future batches become serial.
                if mode==0&&elapsed>previous_ms*(weight as f64/previous_weight.max(1) as f64).max(0.25)*1.5{s.parallel=false;}
            });
            rows
        }else{items.iter().map(f).collect()}
    }
}

pub(crate) fn map<T:Sync,R:Send,F:Fn(&T)->R+Sync+Send>(kind:Kind,items:&[T],weight:usize,f:F)->Vec<R> {
    #[cfg(feature="shared-threads")]
    { shared::map(kind,items,weight,f) }
    #[cfg(not(feature="shared-threads"))]
    { let _=(kind,weight);items.iter().map(f).collect() }
}
pub(crate) fn status()->Value {
    #[cfg(feature="shared-threads")] {shared::status()}
    #[cfg(not(feature="shared-threads"))] {json!({"workers":0,"mode":1,"kinds":[]})}
}
pub(crate) fn configure(mode:u32) {
    #[cfg(feature="shared-threads")] shared::configure(mode);
    #[cfg(not(feature="shared-threads"))] let _=mode;
}
#[cfg(feature="shared-threads")]
pub(crate) fn enabled(n:usize) {shared::enabled(n);}
