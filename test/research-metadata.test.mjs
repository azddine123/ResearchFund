import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeMetadata} from '../shared/research-metadata.mjs';
const legacy={name:'Legacy',description:'Compatible',category:'Énergie'};
test('legacy metadata is retained with empty research fields',()=>{const m=normalizeMetadata(legacy);assert.equal(m.category,'Énergie');assert.equal(m.objectives,'');assert.deepEqual(m.documents,[]);});
test('scientific metadata round-trip retains declarations',()=>{const m={...legacy,objectives:'Measure',methodology:'Compare',outcomes:'Report',team:'Team',milestones:['Plan'],demo:true};assert.deepEqual(normalizeMetadata(normalizeMetadata(m)),normalizeMetadata(m));});
test('reject oversized text and unsafe document references',()=>{assert.throws(()=>normalizeMetadata({...legacy,methodology:'x'.repeat(4001)}));assert.throws(()=>normalizeMetadata({...legacy,documents:[{name:'x',cid:'javascript:alert(1)',type:'text/plain',size:1}]}));assert.throws(()=>normalizeMetadata({...legacy,milestones:Array(13).fill('Step')}));});
const imageCID="bafkreigh2akiscaildcqgprjrzmfzjzqvtdw7s5b3wn62k6xgcy5jzq4ua";
test("image CID survives normalization and legacy projects remain valid",()=>{
 assert.equal(normalizeMetadata({...legacy,image:imageCID}).image,imageCID);
 assert.equal(normalizeMetadata(legacy).image,undefined);
 assert.throws(()=>normalizeMetadata({...legacy,image:"https://example.com/image.png"}));
});
