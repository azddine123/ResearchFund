import {CID} from 'multiformats/cid';
export const FIELDS = ['Artificial Intelligence','Cybersecurity','Healthcare & Biotechnology','Renewable Energy','Robotics & IoT','Environmental Science','Open Science','Other Research'];
function text(value,limit,required=false){
 if(value===undefined&&!required)return '';
 if(typeof value!=='string'||value.length>limit||(required&&!value.trim()))throw Error(`Texte invalide (maximum ${limit} caractères)`);
 return value.trim();
}
export function normalizeMetadata(data){
 if(!data||typeof data!=='object'||Array.isArray(data))throw Error('Métadonnées invalides');
 const out={schemaVersion:2,name:text(data.name,80,true),description:text(data.description,2000),category:text(data.category??'Other Research',50,true)};
 for(const field of ['objectives','methodology','outcomes','team'])out[field]=text(data[field],4000);
 if(data.image){out.image=text(data.image,100,true);CID.parse(out.image);}
 out.demo=data.demo===true;
 if(data.milestones!==undefined&&!Array.isArray(data.milestones))throw Error('Étapes invalides');
 out.milestones=(data.milestones??[]).map(x=>text(x,300,true));
 if(out.milestones.length>12)throw Error('Maximum 12 étapes');
 if(data.documents!==undefined&&!Array.isArray(data.documents))throw Error('Documents invalides');
 out.documents=(data.documents??[]).map(d=>{
  const name=text(d.name,120,true),cid=text(d.cid,100,true);CID.parse(cid);
  if(!['application/pdf','text/plain','text/markdown'].includes(d.type))throw Error('Document : PDF, TXT ou Markdown uniquement');
  if(!Number.isSafeInteger(d.size)||d.size<=0||d.size>10*1024*1024)throw Error('Document : taille déclarée maximale 10 Mo');
  return {name,cid,type:d.type,size:d.size};
 });
 if(out.documents.length>8)throw Error('Maximum 8 documents');
 return out;
}
