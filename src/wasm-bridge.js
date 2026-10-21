// I/O only. The default entry owns the authoritative Rust state; compute workers
// select the separate read-only planning entry in their isolated instances.
export function bridge(instance, entry='execute') {
  const e=instance.exports, encoder=new TextEncoder(), decoder=new TextDecoder();
  return request=>{
    const bytes=encoder.encode(JSON.stringify(request)),ptr=e.allocate(bytes.length);
    new Uint8Array(e.memory.buffer,ptr,bytes.length).set(bytes);
    const out=e[entry](ptr,bytes.length);
    const result=JSON.parse(decoder.decode(new Uint8Array(e.memory.buffer,out,e.output_len())));
    if(!result.ok)throw new Error(result.error);
    return result.value;
  };
}
