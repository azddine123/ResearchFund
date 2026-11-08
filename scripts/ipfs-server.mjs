// IPFS local via Helia/UnixFS. Aucun secret Pinata exposé au navigateur.
// Les blocs persistés sont exportables ; la réplication publique reste à configurer.
import {createHelia} from 'helia';
import {unixfs} from '@helia/unixfs';
import {FsBlockstore} from 'blockstore-fs';
import {CID} from 'multiformats/cid';
import http from 'node:http';
import {normalizeMetadata} from '../shared/research-metadata.mjs';
import fs from 'node:fs/promises';
const store=new FsBlockstore('.ipfs/blocks');await store.open();
const helia=await createHelia({blockstore:store,start:false});
const files=unixfs(helia);
const allowed=new Set(['http://localhost:5173','http://127.0.0.1:5173','http://localhost:4173','http://127.0.0.1:4173']);
function imageType(b){
 if(b.length>=24&&b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return 'image/png';
 if(b.length>=4&&b[0]===255&&b[1]===216&&b[2]===255)return 'image/jpeg';
 if(b.length>=16&&b.toString('ascii',0,4)==='RIFF'&&b.toString('ascii',8,12)==='WEBP')return 'image/webp';
 return null;
}
const server=http.createServer(async(req,res)=>{
 const origin=req.headers.origin;
 if(origin&&!allowed.has(origin)){res.writeHead(403);res.end('Origin refusée');return;}
 if(origin)res.setHeader('Access-Control-Allow-Origin',origin);
 res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');res.setHeader('Access-Control-Allow-Headers','Content-Type');
 res.setHeader('X-Content-Type-Options','nosniff');
 if(req.method==='OPTIONS'){res.writeHead(204);res.end();return;}
 try{
  if(req.method==='POST'&&req.url==='/images'){
   let size=0;const chunks=[];
   for await(const chunk of req){size+=chunk.length;if(size>5*1024*1024)throw Error('Image : maximum 5 Mo');chunks.push(chunk);}
   const bytes=Buffer.concat(chunks);if(!imageType(bytes))throw Error('Image : PNG, JPEG ou WebP uniquement');
   const cid=await files.addBytes(bytes,{cidVersion:1,rawLeaves:true});
   res.setHeader('Content-Type','application/json');res.end(JSON.stringify({cid:cid.toString()}));return;
  }
  if(req.method==='POST'&&req.url==='/add'){
   let bytes=0;const chunks=[];for await(const chunk of req){bytes+=chunk.length;if(bytes>65536)throw Error('Métadonnées trop volumineuses');chunks.push(chunk);}
   const data=JSON.parse(Buffer.concat(chunks).toString());
   const content=Buffer.from(JSON.stringify(normalizeMetadata(data),null,2));
   const cid=await files.addBytes(content,{cidVersion:1,rawLeaves:true});
   await fs.mkdir('docs/metadata',{recursive:true});await fs.writeFile(`docs/metadata/${cid}.json`,content);
   res.setHeader('Content-Type','application/json');res.end(JSON.stringify({cid:cid.toString(),storage:'IPFS Helia local, blocs persistants, sans annonce P2P'}));return;
  }
  if(req.method==='GET'&&req.url.startsWith('/ipfs/')){
   const cid=CID.parse(decodeURIComponent(req.url.slice(6)));const chunks=[];for await(const b of files.cat(cid,{offline:true}))chunks.push(b);
   const bytes=Buffer.concat(chunks);res.setHeader('Content-Type',imageType(bytes)||'application/json');res.end(bytes);return;
  }
  if(req.url==='/health'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({ok:true,mode:'Helia UnixFS local/offline'}));return;}
  res.writeHead(404);res.end('Introuvable');
 }catch(e){res.writeHead(400,{'Content-Type':'text/plain; charset=utf-8'});res.end(e.message);}
});
server.listen(8787,'127.0.0.1',()=>console.log('IPFS Helia local : http://127.0.0.1:8787 (stockage réel, réseau P2P désactivé)'));
