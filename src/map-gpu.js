// Batch only the noninteractive vessel overlay. Map labels, roads and city hit
// testing stay in SVG. WebGL is optional; context failure immediately uses SVG.
const corners=[[0,-3],[2.8,2.3],[-2.8,2.3]];
export class VesselGPU {
 constructor(canvas){
  this.canvas=canvas;this.failed=false;this.vertices=new Float32Array(0);
  canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();this.failed=true;});
  try {
   const gl=this.gl=canvas.getContext('webgl',{alpha:true,antialias:true,premultipliedAlpha:true,depth:false,stencil:false});
   if(!gl)throw Error('WebGL unavailable');
   const shader=(type,source)=>{const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error('Shader failed');return s;};
   const vertex=shader(gl.VERTEX_SHADER,`attribute vec2 position;attribute vec2 corner;attribute vec3 color;uniform vec4 camera;uniform float size;varying vec3 tint;varying vec2 shape;void main(){vec2 p=(position+corner*size-camera.xy)/camera.zw;gl_Position=vec4(p.x*2.0-1.0,1.0-p.y*2.0,0.0,1.0);tint=color;shape=corner;}`);
   const fragment=shader(gl.FRAGMENT_SHADER,`precision mediump float;varying vec3 tint;varying vec2 shape;void main(){float edge=min(2.3-shape.y,(shape.y+3.0)*0.5283-abs(shape.x));gl_FragColor=vec4(edge<0.4?vec3(0.071,0.196,0.227):tint,1.0);}`);
   const program=this.program=gl.createProgram();gl.attachShader(program,vertex);gl.attachShader(program,fragment);gl.linkProgram(program);
   gl.deleteShader(vertex);gl.deleteShader(fragment);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error('Program failed');
   this.buffer=gl.createBuffer();this.camera=gl.getUniformLocation(program,'camera');this.size=gl.getUniformLocation(program,'size');
   this.attributes=[['position',2,0],['corner',2,8],['color',3,16]].map(([name,count,offset])=>[gl.getAttribLocation(program,name),count,offset]);
  }catch{this.failed=true;}
 }
 draw(samples,positions,camera,rect){
  if(this.failed)return false;
  const gl=this.gl,ratio=Math.min(globalThis.devicePixelRatio||1,2);
  const scale=Math.min(rect.width/camera[2],rect.height/camera[3]);
  const width=Math.max(1,Math.round(camera[2]*scale*ratio)),height=Math.max(1,Math.round(camera[3]*scale*ratio));
  if(this.canvas.width!==width||this.canvas.height!==height){this.canvas.width=width;this.canvas.height=height;}
  const count=samples.length*21;if(this.vertices.length<count)this.vertices=new Float32Array(Math.max(count,this.vertices.length*2));
  let j=0;
  for(let i=0;i<samples.length;i++)for(const corner of corners){
   const p=positions[i],color=samples[i].color;
   this.vertices[j++]=p.x;this.vertices[j++]=p.y;this.vertices[j++]=corner[0];this.vertices[j++]=corner[1];
   this.vertices[j++]=color[0];this.vertices[j++]=color[1];this.vertices[j++]=color[2];
  }
  gl.viewport(0,0,width,height);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);
  gl.useProgram(this.program);gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);gl.bufferData(gl.ARRAY_BUFFER,this.vertices.subarray(0,count),gl.DYNAMIC_DRAW);
  for(const [location,size,offset] of this.attributes){gl.enableVertexAttribArray(location);gl.vertexAttribPointer(location,size,gl.FLOAT,false,28,offset);}
  gl.uniform4fv(this.camera,camera);gl.uniform1f(this.size,Math.max(.2,camera[2]/900));
  gl.drawArrays(gl.TRIANGLES,0,samples.length*3);
  return !gl.isContextLost();
 }
 destroy(){if(this.gl){this.gl.deleteBuffer(this.buffer);this.gl.deleteProgram(this.program);}}
}
