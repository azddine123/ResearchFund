import fs from 'node:fs/promises';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {CID} from 'multiformats/cid';
// Valider les métadonnées du déploiement courant, pas les archives d’anciens nœuds.
const {JsonRpcProvider,Contract}=await import('ethers');
const cfg=JSON.parse(await fs.readFile('frontend/public/config.json','utf8'));
const core=new Contract(cfg.addresses.core,cfg.abis.core,new JsonRpcProvider(cfg.readRpc));
const count=Number(await core.campaignCount());
assert.ok(count>0,'Lancer la démo avant ce test');
const paths=await Promise.all(Array.from({length:count},async(_,id)=>(await core.campaigns(id)).metadataCID+'.json'));
for(const path of paths){
 const cid=CID.parse(path.slice(0,-5));assert.equal(cid.code,0x55,'Ce test vise les petits fichiers raw produits par la démo.');
 const r=await fetch(`http://127.0.0.1:8787/ipfs/${cid}`);assert.equal(r.status,200);const bytes=Buffer.from(await r.arrayBuffer());
 assert.deepEqual(bytes,await fs.readFile(`docs/metadata/${path}`));
 assert.deepEqual(createHash('sha256').update(bytes).digest(),Buffer.from(cid.multihash.digest));
}
const rejected=await fetch('http://127.0.0.1:8787/add',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});assert.equal(rejected.status,400);
const origin=await fetch('http://127.0.0.1:8787/health',{headers:{Origin:'https://untrusted.example'}});assert.equal(origin.status,403);
console.log(`${paths.length} métadonnées relues par CID, identiques aux sources, empreintes SHA-256 vérifiées. JSON invalide et origine non autorisée rejetés.`);
