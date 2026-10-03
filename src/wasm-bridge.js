// I/O only: each call crosses into the sole authoritative Rust game state.
export function bridge(instance) {
  const e=instance.exports, encoder=new TextEncoder(), decoder=new TextDecoder();
  return request=>{
    const bytes=encoder.encode(JSON.stringify(request)),ptr=e.allocate(bytes.length);
    new Uint8Array(e.memory.buffer,ptr,bytes.length).set(bytes);
    const out=e.execute(ptr,bytes.length);
    const result=JSON.parse(decoder.decode(new Uint8Array(e.memory.buffer,out,e.output_len())));
    if(!result.ok)throw new Error(result.error);
    return result.value;
  };
}
