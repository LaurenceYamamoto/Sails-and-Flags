// Period-inspired names; these are flavour names, not claims about particular historic ships.
export const SHIP_NAMES=['Providence','Endeavour','Hope','Dolphin','Swift','Pearl','Rose','Fortune','Adventure','Unity','Mercury','Sea Flower','Good Intent','Lion','Mary','Elizabeth','Swan','Phoenix','Neptune','Discovery','Resolution','Friendship','Morning Star','Lark'];
export const escapeName=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const validName=value=>typeof value==='string'&&value.trim()===value&&value.length>0&&value.length<=80&&!/[\u0000-\u001f\u007f]/.test(value);
export function checkedName(value){const result=typeof value==='string'?value.trim():value;if(!validName(result))throw new Error('名前は空白以外の1～80文字で入力してください。');return result;}
export function shipName(s,ship){return ship.name??SHIP_NAMES[((s.seed>>>0)+Number(ship.id.split('-')[1]))%SHIP_NAMES.length];}
