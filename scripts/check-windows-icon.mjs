import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const icon=await readFile(new URL('../src-tauri/icons/icon.ico',import.meta.url));
assert.equal(icon.readUInt16LE(0),0);
assert.equal(icon.readUInt16LE(2),1);
const count=icon.readUInt16LE(4);
const sizes=[];
for(let index=0;index<count;index++){
  const offset=6+16*index;
  const width=icon[offset]||256,height=icon[offset+1]||256;
  assert.equal(width,height);
  assert.equal(icon.readUInt16LE(offset+6),32);
  const bytes=icon.readUInt32LE(offset+8),start=icon.readUInt32LE(offset+12);
  assert.ok(start>=6+16*count&&bytes>0&&start+bytes<=icon.length,'Valid icon image payload');
  sizes.push(width);
}
// Tauri 2.11 codegen decodes the first ICO entry as the native window icon.
assert.equal(sizes[0],256,'Use the high-resolution image for the native taskbar icon');
for(const size of [16,24,32,48,64,256])assert.ok(sizes.includes(size),`Keep Windows ${size}px icon`);
console.log(`PASS: high-resolution window icon; native sizes ${sizes.join(', ')}.`);
