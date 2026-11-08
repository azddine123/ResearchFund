import {BrowserProvider,JsonRpcProvider,Contract,formatEther,parseEther,isAddress} from 'ethers';
import {FIELDS,normalizeMetadata} from '../shared/research-metadata.mjs';
import {CID} from 'multiformats/cid';
const $=id=>document.getElementById(id), fmt=v=>Number(formatEther(v)).toLocaleString('fr-FR',{maximumFractionDigits:4});
const short=v=>v?`${v.slice(0,6)}…${v.slice(-4)}`:'—';
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const labels=['En cours','Objectif atteint','Échouée','Annulée','Remboursements ouverts'];
let cfg,provider,contracts,account,signer,walletProvider,chainTime=0,filter='all',campaignLimit=24,proposalLimit=24,busy=false;
let roles={admin:false,manager:false,signer:false},pausedState=false,threshold=0n,adminRole,managerRole,chainSigners=[],refreshing=false;
const sameAddress=(a,b)=>!!a&&!!b&&a.toLowerCase()===b.toLowerCase();
let replacementLimit=24;
let categoryFilter='all',pendingFunding;
for(const field of FIELDS){$('category-filter').add(new Option(field,field));$('campaign-category').add(new Option(field,field));}
$('category-filter').onchange=e=>{categoryFilter=e.target.value;renderCampaigns();};
let campaignData=[];const metaCache=new Map();
function notice(message,error=false){$('notice').hidden=false;$('notice').className=`notice${error?' error':''}`;$('notice').textContent=message;}
function switchTab(tab){document.querySelectorAll('.view').forEach(e=>e.classList.toggle('active',e.id===tab));document.querySelectorAll('.nav').forEach(e=>e.classList.toggle('active',e.dataset.tab===tab));$('page-label').textContent=document.querySelector(`[data-tab="${tab}"] span`).textContent;}
document.querySelectorAll('.nav').forEach(b=>b.onclick=()=>switchTab(b.dataset.tab));
document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>b.closest('dialog').close());
document.querySelectorAll('.filter').forEach(b=>b.onclick=()=>{filter=b.dataset.filter;document.querySelectorAll('.filter').forEach(x=>x.classList.toggle('selected',x===b));renderCampaigns();});
async function connect(){
 if(!contracts)throw Error('Attendez la connexion au réseau.');
 if(!window.ethereum)throw Error('Installez MetaMask pour signer. La lecture reste accessible sans portefeuille.');
 walletProvider=new BrowserProvider(window.ethereum);await walletProvider.send('eth_requestAccounts',[]);
 const net=await walletProvider.getNetwork();if(Number(net.chainId)!==cfg.chainId)throw Error(`Choisissez le réseau ${cfg.network}, chainId ${cfg.chainId}, dans MetaMask.`);
 signer=await walletProvider.getSigner();account=await signer.getAddress();$('campaign-beneficiary').value=account;await refresh();$('connect').textContent=short(account);
}
$('hero-guide').onclick=()=>switchTab('guide');
$('connect').onclick=()=>connect().catch(e=>notice(e.message,true));
window.ethereum?.on?.('accountsChanged',()=>location.reload());window.ethereum?.on?.('chainChanged',()=>location.reload());
async function write(key,method,args=[],options={}){
 if(busy)return;busy=true;
 const buttons=[...document.querySelectorAll('button')].map(b=>[b,b.disabled]);buttons.forEach(([b])=>b.disabled=true);
 try{
  if(!signer)await connect();
  const net=await walletProvider.getNetwork();if(Number(net.chainId)!==cfg.chainId)throw Error('Réseau du portefeuille incorrect.');
  notice('Vérifiez puis confirmez la transaction dans MetaMask.');
  const tx=await contracts[key].connect(signer)[method](...args,options);notice(`Transaction envoyée : ${tx.hash}`);
  await tx.wait();notice(`Transaction confirmée : ${tx.hash}`);await refresh();return true;
 }catch(e){notice(e.shortMessage||e.reason||e.message,true);return false;}
 finally{busy=false;buttons.forEach(([b,disabled])=>{if(b.isConnected)b.disabled=disabled;});applyAccess();}
}
async function metadata(cid){
 if(metaCache.has(cid))return metaCache.get(cid);
 let data={name:'Métadonnées indisponibles',description:'Le CID reste vérifiable sur la blockchain. Démarrez le nœud IPFS local ou vérifiez sa disponibilité publique.',category:'Projet'};
 try{
  CID.parse(cid);
  for(const base of ['http://127.0.0.1:8787/ipfs/','https://ipfs.io/ipfs/']){
   try{const r=await fetch(base+encodeURIComponent(cid),{signal:AbortSignal.timeout(3500)});if(!r.ok)continue;
    const text=await r.text();if(text.length>65536)continue;const m=JSON.parse(text);
    data=normalizeMetadata(m);break;
   }catch{}
  }
 }catch{}
 metaCache.set(cid,data);return data;
}
async function refresh(){
 while(refreshing)await refreshing;
 $('refresh-roles').disabled=true;refreshing=refreshData();
 try{await refreshing;}finally{refreshing=false;$('refresh-roles').disabled=busy;}
}
async function refreshData(){
 const block=await provider.getBlock('latest');chainTime=block.timestamp;
 const [count,escrow,paused,pcount]=await Promise.all([contracts.core.campaignCount(),contracts.core.totalEscrow(),contracts.core.paused(),contracts.dao.proposalCount()]);
 pausedState=paused;
 [adminRole,managerRole,threshold,chainSigners]=await Promise.all([contracts.core.ADMIN_ROLE(),contracts.core.DEFAULT_ADMIN_ROLE(),contracts.core.MULTISIG_THRESHOLD(),Promise.all([0,1,2].map(i=>contracts.guard.signers(i)))]);
 const rights=account?await Promise.all([contracts.core.hasRole(adminRole,account),contracts.core.hasRole(managerRole,account),contracts.guard.isSigner(account)]):[false,false,false];
 roles={admin:rights[0],manager:rights[1],signer:rights[2]};
 campaignData=await Promise.all(Array.from({length:Math.min(Number(count),campaignLimit)},async(_,id)=>{
  const [c,status,withdrawalDeadline,governable,releaseReady,proposerWeight]=await Promise.all([contracts.core.campaigns(id),contracts.core.status(id),contracts.core.withdrawalDeadline(id),contracts.core.isGovernable(id),contracts.core.canProposeRelease(id),account?contracts.core.getPastCampaignVotes(id,account,block.number-1):0n]);
  const m=await metadata(c.metadataCID);const contribution=account?await contracts.core.contributions(id,account):0n;
  const key=await contracts.guard.withdrawalKey(cfg.addresses.core,id,c.beneficiary,c.escrow);
  const [approvals,signatureStates]=await Promise.all([contracts.guard.approvals(key),Promise.all(chainSigners.map(a=>contracts.guard.approvedBy(key,a)))]);
  return {withdrawalDeadline:Number(withdrawalDeadline),governable,releaseReady,proposerWeight,id,c,status:Number(status),m,contribution,approvals:Number(approvals),signatureStates};
 }));
 $('stat-raised').textContent=fmt(campaignData.reduce((a,x)=>a+x.c.raised,0n))+' ETH';
 if(Number(count)>campaignLimit)$('stat-raised').title='Somme des campagnes chargées uniquement';
 $('stat-escrow').textContent=fmt(escrow)+' ETH';$('stat-count').textContent=count.toString();$('stat-votes').textContent=account?fmt(await contracts.token.balanceOf(account))+' CFD':'Non connecté';
 $('stat-votes').classList.toggle('disconnected', !account);
 $('vote-note').textContent=account?'CFD historiques ; votes calculés séparément par projet.':'Connectez votre portefeuille.';
 $('network').textContent=` ${cfg.network==='localhost'?'Hardhat local':cfg.network} · ${cfg.chainId}`;
 $('more-campaigns').hidden=Number(count)<=campaignLimit;renderCampaigns();
 const projectSelect=$('proposal-campaign'),previousProject=projectSelect.value;
 projectSelect.replaceChildren(new Option(campaignData.length?'Choisissez un projet':'Aucun projet disponible',''),...campaignData.map(({id,m})=>new Option(`${m.name} · #${id}`,String(id))));
 projectSelect.options[0].disabled=true;
 projectSelect.value=campaignData.some(({id})=>String(id)===previousProject)?previousProject:'';
 projectSelect.disabled=!campaignData.length;updateProposalEligibility();
 $('proposal-projects-note').textContent=Number(count)>campaignData.length?'Liste des projets chargés. Utilisez « Charger davantage » dans Explorer pour afficher les suivants.':'';
 renderReceipt();
 $('system-state').innerHTML=`<p><span class="pill${paused?' cancel':''}">${paused?'En pause':'Opérationnel'}</span> Bloc ${block.number} · ${new Date(chainTime*1000).toLocaleString('fr-FR')} (horloge de la chaîne)</p><p>Solde : <b>${fmt(await provider.getBalance(cfg.addresses.core))} ETH</b> · Engagements : <b>${fmt(escrow)} ETH</b></p><p>La pause suspend création, contributions et versements. Les remboursements ouverts restent accessibles.</p>`;
 $('addresses').innerHTML=Object.entries(cfg.addresses).map(([k,a])=>`<div><b>${esc(k)}</b> ${esc(a)}</div>`).join('');
 $('signers').innerHTML=chainSigners.map((a,i)=>`<div>Signataire ${i+1} : ${esc(a)}</div>`).join('');
 renderRoles();applyAccess();await renderReplacements();
 await renderProposals(Number(pcount));
 $('research-metrics').innerHTML=`<div><b>${campaignData.filter(x=>x.status===0).length}</b> Active Research Campaigns</div><div><b>${campaignData.filter(x=>x.c.raised>=x.c.goal&&!x.c.cancelled).length}</b> Objectifs de financement atteints</div><div><b>${account?fmt(campaignData.reduce((a,x)=>a+x.contribution,0n))+' ETH':'Connectez-vous'}</b> My Contributions · net des remboursements</div><div><b>${$('proposal-list').dataset.pending}</b> Pending Governance Decisions</div><small>Indicateurs calculés sur les ${campaignData.length} projets chargés. Le versement exige la fin de collecte, l’objectif atteint et une décision DAO.</small>`;
}
const proofSelect = $('proof-campaign');
const proofDetails = $('proof-details');
let proofRequest = 0;

function renderReceipt() {
 const previous = proofSelect.value;
 proofSelect.replaceChildren(...campaignData.map(({id, m}) => new Option(m.name, String(id))));
 if (campaignData.some(({id}) => String(id) === previous)) proofSelect.value = previous;
 showReceipt();
}

function showReceipt() {
 const selected = campaignData.find(({id}) => String(id) === proofSelect.value);
 proofRequest++;
 if (!selected) {
  $('proof-state').textContent = 'Aucune campagne disponible.';
  return;
 }
 const {id, c, status} = selected;
 $('proof-raised').textContent = fmt(c.raised) + ' ETH';
 $('proof-escrow').textContent = fmt(c.escrow) + ' ETH';
 $('proof-id').textContent = 'Campagne #' + id;
 $('proof-state').textContent = c.withdrawn ? 'Versement effectué' : c.cancelled ? 'Annulée · remboursements ouverts' : status === 4 ? 'Délai de versement expiré · remboursements ouverts' : status === 2 ? 'Échouée · remboursements ouverts' : c.releaseApproved ? 'Retrait autorisé' : 'Versement en attente';
 if (proofDetails.open) loadProof(selected);
}

async function loadProof({id, c}) {
 const sequence = ++proofRequest;
 const panel = $('proof-chain');
 panel.textContent = 'Recherche de la transaction…';
 try {
  const filter = c.withdrawn ? contracts.core.filters.Withdrawn(id) : contracts.core.filters.CampaignCreated(id);
  const logs = await contracts.core.queryFilter(filter, cfg.deployedAtBlock, 'latest');
  if (sequence !== proofRequest) return;
  const event = logs.at(-1);
  if (!event) { panel.textContent = 'Aucun événement correspondant dans cet historique.'; return; }
  panel.textContent = (c.withdrawn ? 'Versement de ' + fmt(event.args.amount) + ' ETH' : 'Création de la campagne') + ' · bloc ' + event.blockNumber + ' · transaction ' + event.transactionHash;
 } catch {
  if (sequence === proofRequest) panel.textContent = 'Le nœud ne peut pas fournir cet historique pour le moment.';
 }
}

proofSelect.addEventListener('change', showReceipt);
proofDetails.addEventListener('toggle', () => {
 if (proofDetails.open) showReceipt();
 else proofRequest++;
});

function campaignArtwork(id, metadata){
 if(metadata.image)return `<img class="campaign-artwork" src="http://127.0.0.1:8787/ipfs/${encodeURIComponent(metadata.image)}" alt="Illustration de ${esc(metadata.name)}" loading="lazy" decoding="async">`;
 const photos={
  'Smart Agriculture AI':['smart-agriculture','Plant et capteur d’humidité avec irrigation au goutte-à-goutte dans une serre'],
  'Solar Energy Optimization':['solar-energy','Panneaux photovoltaïques orientables au coucher du soleil'],
  'AI-Assisted Medical Imaging':['medical-imaging','Chercheuse étudiant des images cérébrales dans un laboratoire d’imagerie médicale'],
  'Open Cybersecurity Research Lab':['cybersecurity','Deux chercheurs analysant un réseau informatique dans un laboratoire']
 };
 const photo=photos[metadata.name];
 if(photo)return `<img class="campaign-artwork" src="/images/projects/${photo[0]}.webp" alt="${photo[1]}" width="2172" height="724" loading="lazy" decoding="async">`;

 const scenes=[
 `<circle cx="420" cy="108" r="62" fill="#ef633f"/><g stroke="#60311e" stroke-width="1.5" fill="none"><circle cx="420" cy="108" r="88"/><circle cx="420" cy="108" r="102" stroke-dasharray="2 8"/><path d="M0 215 135 145 270 210 390 150 600 220"/><path d="M85 235 140 135 330 135 275 235Z" fill="#323c32"/><path d="M140 135 140 235M188 135 188 235M236 135 236 235M284 135 284 235M110 185H302" stroke="#bbc8a2"/></g><text x="28" y="124" font-size="70" fill="#8e5d43" opacity=".23" font-family="Arial">AI / IoT</text>`,
 `<g fill="none" stroke="#244f60" stroke-width="1.3"><ellipse cx="325" cy="186" rx="80" ry="22"/><ellipse cx="325" cy="186" rx="125" ry="36"/><ellipse cx="325" cy="186" rx="176" ry="52"/><ellipse cx="325" cy="186" rx="230" ry="71"/><ellipse cx="325" cy="186" rx="285" ry="96"/></g><path d="M325 47c-10 28-45 49-45 82a45 45 0 0090 0c0-33-35-54-45-82Z" fill="#24596d"/><path d="M315 106c-10 14-15 25-8 38" fill="none" stroke="#b9e5e0" stroke-width="4" stroke-linecap="round"/><circle cx="468" cy="64" r="5" fill="#24596d"/><path d="M42 50H110M76 16V84" stroke="#538887"/>`,
 `<g stroke="#5c477c" stroke-width="1.4" fill="none"><path d="m135 190 80-100 105 54 86-72 80 118-166 12Z"/><path d="m135 190 185-46 166 56M215 90l105 112 86-130"/><circle cx="320" cy="144" r="90" stroke-dasharray="3 8"/></g><g fill="#49345f"><circle cx="135" cy="190" r="14"/><circle cx="215" cy="90" r="24"/><circle cx="320" cy="144" r="38"/><circle cx="406" cy="72" r="18"/><circle cx="486" cy="200" r="23"/><circle cx="320" cy="202" r="10"/></g><path d="m304 145 12 12 24-26" stroke="#e0cff4" stroke-width="4" fill="none"/>`,
 `<g stroke="#37513b" fill="none"><path d="M0 210 130 70 250 210 390 35 600 215" stroke-width="1.4"/><path d="M5 240C90 135 175 240 270 170S420 200 590 82" stroke-width="9"/><path d="M5 240C90 135 175 240 270 170S420 200 590 82" stroke="#dce8b1" stroke-width="2" stroke-dasharray="7 10"/></g><circle cx="390" cy="68" r="20" fill="#dce8b1" stroke="#37513b"/><circle cx="390" cy="68" r="7" fill="#37513b"/><text x="28" y="120" font-size="55" fill="#37513b" opacity=".25" font-family="Arial">CYBER</text>`
 ];
 return `<svg viewBox="0 0 600 270" aria-hidden="true" class="campaign-artwork">${scenes[id%4]}</svg>`;
}
function renderCampaigns(){
 const amounts=new Map([...document.querySelectorAll('.amount')].map(el=>[el.id,el.value]));
 const data=campaignData.filter(x=>(filter==='all'||String(x.status)===filter)&&(categoryFilter==='all'||x.m.category===categoryFilter));
 $('campaign-list').innerHTML=data.length?data.map(({id,c,status,m,contribution,approvals,withdrawalDeadline,governable,proposerWeight})=>{
  const percent=Number(c.raised*10000n/c.goal)/100;const days=Math.max(0,Math.ceil((Number(c.deadline)-chainTime)/86400));
  return `<article class="card"><div class="card-art art-${id%4}"><span class="pill ${status===3?'cancel':''}">${labels[status]}${c.withdrawn?' · Versée':''}</span>${campaignArtwork(id,m)}<span class="tag-id">INITIATIVE / ${String(id+1).padStart(2,'0')}</span></div><div class="card-body"><div class="card-title-row"><div><span class="category">${esc(m.category)}</span><h3>${esc(m.name)}</h3></div><button class="project-arrow" data-detail="${id}" aria-label="Consulter ${esc(m.name)}">↗</button></div><p class="description">${esc(m.description)}</p>${m.demo?'<span class="pill">Données fictives · démonstration</span>':''}<button class="text-button" data-detail="${id}">Consulter le projet →</button><div class="progress"><span style="width:${Math.min(100,percent)}%"></span></div><div class="funding-row"><span><b>${fmt(c.raised)} ETH</b> collectés</span><span>sur ${fmt(c.goal)} ETH</span></div><div class="card-bottom"><span>${status===0?`${days} j restants`:`Campagne #${id}`}</span><span>${percent.toLocaleString('fr-FR',{maximumFractionDigits:1})} % de l’objectif</span></div><div class="card-actions">${status===0?`<input aria-label="Montant campagne ${id}" class="amount" id="amount-${id}" value="${esc(amounts.get(`amount-${id}`)||'')}" placeholder="ETH" type="number" min="0.000001" step="any"><button class="primary" data-contribute="${id}">Contribuer ↗</button>`:''}${[2,3,4].includes(status)&&contribution>0n?`<button class="primary" data-refund="${id}">Récupérer ${fmt(contribution)} ETH</button>`:''}${status===1&&sameAddress(account,c.beneficiary)&&c.releaseApproved&&!c.withdrawn&&!c.cancelled&&!pausedState&&(c.escrow<=threshold||approvals>=2)?`<button class="primary" data-withdraw="${id}">Retirer les fonds</button>`:''}</div><div class="card-bottom" style="margin-top:12px"><span>Séquestre : ${fmt(c.escrow)} ETH</span><span>DAO : ${c.releaseApproved?'accordée':'requise'}</span></div>${c.escrow>parseEther('1')?`<small>Multisig : ${approvals}/2 approbations sur le montant actuel</small>`:''}<p class="settlement-note">${c.withdrawn?'Versement effectué':`Limite de versement : ${new Date(withdrawalDeadline*1000).toLocaleString('fr-FR')} · ensuite remboursement si non versé.`}</p><div class="card-actions">${governable&&proposerWeight>=parseEther('1')?`<button class="text-button" data-propose="${id}">Proposer une décision →</button>`:''}<a class="text-button" href="http://127.0.0.1:8787/ipfs/${encodeURIComponent(c.metadataCID)}" target="_blank" rel="noopener">Métadonnées IPFS ↗</a></div><small class="mono" title="${esc(c.beneficiary)}">Bénéficiaire ${short(c.beneficiary)}</small></div></article>`;
 }).join(''):'<div class="empty">Aucune campagne dans cette catégorie.</div>';
 document.querySelectorAll('[data-contribute]').forEach(b=>b.onclick=()=>{try{const amount=parseEther($(`amount-${b.dataset.contribute}`).value);if(amount<=0n)throw Error('Saisissez un montant strictement positif.');pendingFunding={id:b.dataset.contribute,amount};$('fund-form').reset();$('fund-summary').textContent=`Don de ${fmt(amount)} ETH · ${fmt(amount*1000n)} CFD · projet #${pendingFunding.id}`;$('fund-dialog').showModal();}catch(e){notice(e.message,true);}});
 document.querySelectorAll('[data-detail]').forEach(b=>b.onclick=()=>showProject(Number(b.dataset.detail)));
 document.querySelectorAll('[data-refund]').forEach(b=>b.onclick=()=>write('core','refund',[b.dataset.refund]));
 document.querySelectorAll('[data-withdraw]').forEach(b=>b.onclick=()=>write('core','withdrawFunds',[b.dataset.withdraw]));
 document.querySelectorAll('[data-propose]').forEach(b=>b.onclick=()=>{$('proposal-campaign').value=b.dataset.propose;updateProposalEligibility();$('propose-dialog').showModal();});
 applyAccess();
}
async function renderProposals(count){
 $('more-proposals').hidden=count<=proposalLimit;
 let pending=0;
 const all=await Promise.all(Array.from({length:Math.min(count,proposalLimit)},async(_,id)=>{
  const p=await contracts.dao.proposals(id);const voted=account?await contracts.dao.hasVoted(id,account):false;
  const weight=account?await contracts.core.getPastCampaignVotes(p.campaignId,account,p.snapshotBlock):0n;
  const total=p.yes+p.no;const passed=total>=p.quorum&&p.yes>p.no;const closed=chainTime>=Number(p.deadline);
  const governable=await contracts.core.isGovernable(p.campaignId);
  const state=p.executed?'Exécutée':!governable?'Campagne clôturée':!closed?'Vote ouvert':!passed?'Rejetée':chainTime<Number(p.executableAt)?'Délai de sécurité':'Exécutable';
  if(!p.executed&&governable&&(!closed||passed))pending++;
  const yes=total?Number(p.yes*100n/total):0;
  return `<article class="proposal"><span class="pill">${state}</span><h3>${p.action===0n?'Débloquer les fonds':'Geler la campagne'} #${p.campaignId}</h3><p>Proposition #${id} · Snapshot au bloc ${p.snapshotBlock}<br>Clôture : ${new Date(Number(p.deadline)*1000).toLocaleString('fr-FR')}<br>Exécution au plus tôt : ${new Date(Number(p.executableAt)*1000).toLocaleString('fr-FR')}</p><div class="vote-bar"><span class="yes" style="width:${yes}%"></span><span class="no" style="width:${total?100-yes:0}%"></span></div><div class="vote-detail"><span>Pour : ${fmt(p.yes)} voix</span><span>Contre : ${fmt(p.no)} voix</span></div><p>Participation : ${fmt(total)} / ${fmt(p.quorum)} voix du projet requises<br>Vos voix figées : ${account?fmt(weight):'connectez-vous'} ${voted?'· Vote enregistré':''}</p><div class="actions">${account&&governable&&weight>0n&&!closed&&!voted?`<button class="primary" data-vote="${id}" data-support="true">Voter pour</button><button class="secondary" data-vote="${id}" data-support="false">Voter contre</button>`:''}${state==='Exécutable'?`<button class="primary" data-execute="${id}">Exécuter la décision</button>`:''}</div></article>`;
 }));
 $('proposal-list').dataset.pending=String(pending);
 $('proposal-list').innerHTML=all.join('')||'<div class="empty">Aucune proposition. Les contributeurs avec au moins 1 voix sur ce projet au snapshot peuvent en créer une.</div>';
 document.querySelectorAll('[data-vote]').forEach(b=>b.onclick=()=>write('dao','vote',[b.dataset.vote,b.dataset.support==='true']));
 document.querySelectorAll('[data-execute]').forEach(b=>b.onclick=()=>write('dao','execute',[b.dataset.execute]));
}
$('open-create').onclick=()=>$('create-dialog').showModal();$('open-propose').onclick=()=>{updateProposalEligibility();$('propose-dialog').showModal();};
$('more-campaigns').onclick=()=>{campaignLimit+=24;refresh().catch(e=>notice(e.message,true));};$('more-proposals').onclick=()=>{proposalLimit+=24;refresh().catch(e=>notice(e.message,true));};
let imagePreviewURL;
function clearImagePreview(){
 if(imagePreviewURL)URL.revokeObjectURL(imagePreviewURL);
 imagePreviewURL=null;$('campaign-image-preview').hidden=true;$('campaign-image-preview').removeAttribute('src');$('remove-campaign-image').hidden=true;
}
$('campaign-image').onchange=async()=>{
 clearImagePreview();const file=$('campaign-image').files[0];if(!file)return;
 try{
  if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>5*1024*1024||!file.size)throw Error('Choisissez une image PNG, JPEG ou WebP de 5 Mo maximum.');
  const bitmap=await createImageBitmap(file);bitmap.close();
  if($('campaign-image').files[0]!==file)return;
  imagePreviewURL=URL.createObjectURL(file);$('campaign-image-preview').src=imagePreviewURL;$('campaign-image-preview').hidden=false;$('remove-campaign-image').hidden=false;
 }catch{$('campaign-image').value='';notice('Image invalide : choisissez un fichier PNG, JPEG ou WebP de 5 Mo maximum.',true);}
};
$('remove-campaign-image').onclick=()=>{$('campaign-image').value='';clearImagePreview();};
$('campaign-cid').oninput=()=>{
 const existing=!!$('campaign-cid').value.trim();$('campaign-image').disabled=existing;
 if(existing){$('campaign-image').value='';clearImagePreview();}
};
$('create-form').onsubmit=async e=>{
 e.preventDefault();const submit=e.submitter||$('create-form').querySelector('[type=submit]');if(submit.disabled)return;submit.disabled=true;try{
  const beneficiary=$('campaign-beneficiary').value.trim();if(!isAddress(beneficiary))throw Error('Adresse du bénéficiaire invalide.');
  let cid=$('campaign-cid').value.trim();
  let image;
  const file=$('campaign-image').files[0];
  if(!cid&&file){
   if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>5*1024*1024||!file.size)throw Error('Image : PNG, JPEG ou WebP, maximum 5 Mo.');
   notice('Enregistrement de l’image…');
   const uploaded=await fetch('http://127.0.0.1:8787/images',{method:'POST',headers:{'Content-Type':file.type},body:file,signal:AbortSignal.timeout(30000)});
   if(!uploaded.ok)throw Error(await uploaded.text());image=(await uploaded.json()).cid;
  }
  if(!cid){notice('Enregistrement des métadonnées sur le nœud IPFS local…');const r=await fetch('http://127.0.0.1:8787/add',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(normalizeMetadata({image,name:$('campaign-name').value,description:$('campaign-description').value,category:$('campaign-category').value,objectives:$('campaign-objectives').value,methodology:$('campaign-methodology').value,outcomes:$('campaign-outcomes').value,team:$('campaign-team').value,milestones:$('campaign-milestones').value.split('\n').filter(x=>x.trim()),documents:JSON.parse($('campaign-documents').value||'[]')})),signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error(await r.text());cid=(await r.json()).cid;}
  CID.parse(cid);if(await write('core','createCampaign',[parseEther($('campaign-goal').value),Number($('campaign-days').value)*86400,beneficiary,cid]))$('create-dialog').close();
 }catch(e){notice(e.message,true);}finally{submit.disabled=false;}
};
$('propose-form').onsubmit=async e=>{e.preventDefault();updateProposalEligibility();if($('proposal-submit').disabled)return;if(!campaignData.some(({id})=>String(id)===$('proposal-campaign').value)){notice('Sélectionnez un projet.',true);return;}if(await write('dao','propose',[$('proposal-campaign').value,Number($('proposal-action').value)]))$('propose-dialog').close();};
$('pause').onclick=()=>write('core','pause');$('unpause').onclick=()=>write('core','unpause');
async function anomalies(){
 try{const r=await fetch('/anomalies.json');if(!r.ok)throw Error();const d=await r.json();
  const matches=d.source.chainId===cfg.chainId&&d.source.core.toLowerCase()===cfg.addresses.core.toLowerCase();if(!matches)throw Error('Rapport d’un autre déploiement : relancez l’export.');
  $('anomalies').innerHTML=`<div class="panel"><h2>${d.event_count} contributions analysées</h2><p>Historique limité aux blocs ${d.source.fromBlock}–${d.source.toBlock}. Relancez l’export après de nouvelles transactions.</p></div>`+d.alerts.map(a=>`<div class="panel"><span class="pill cancel">${esc(a.level)} · Campagne #${a.campaign}</span><h2 style="margin-top:15px">${esc(a.rule)}</h2><p>${esc(a.message)}</p><div class="mono">${Object.entries(a.evidence).map(([k,v])=>`${esc(k)} : ${esc(v)}`).join('<br>')}</div></div>`).join('');
 }catch{$('anomalies').innerHTML='<div class="empty">Aucun rapport compatible disponible. Exécutez l’export des événements et le script Python.</div>';}
}
async function init(){
 const r=await fetch('/config.json');if(!r.ok)throw Error('Déployez les contrats pour générer config.json.');cfg=await r.json();if(cfg.rulesVersion!==2)throw Error('Cette interface exige les contrats V2. Déployez la nouvelle version sur un nouveau nœud local.');
 if(cfg.readRpc)provider=new JsonRpcProvider(cfg.readRpc);else{if(!window.ethereum)throw Error('Sur ce réseau, MetaMask est nécessaire pour lire les contrats.');provider=new BrowserProvider(window.ethereum);}
 if(Number((await provider.getNetwork()).chainId)!==cfg.chainId)throw Error('Réseau RPC incompatible avec le déploiement.');
 if(await provider.getCode(cfg.addresses.core)==='0x')throw Error('Contrats absents : le nœud a peut-être redémarré. Relancez le déploiement.');
 contracts=Object.fromEntries(Object.keys(cfg.addresses).map(k=>[k,new Contract(cfg.addresses[k],cfg.abis[k],provider)]));
 if(window.ethereum){try{const wp=new BrowserProvider(window.ethereum);const accounts=await wp.send('eth_accounts',[]);if(accounts.length&&Number((await wp.getNetwork()).chainId)===cfg.chainId){walletProvider=wp;signer=await wp.getSigner(accounts[0]);account=await signer.getAddress();$('campaign-beneficiary').value=account;$('connect').textContent=short(account);}}catch{}}
 governanceWindow=Number(await contracts.dao.votingPeriod())+Number(await contracts.dao.executionDelay());
 await refresh();await anomalies();setInterval(()=>{if(!busy&&!refreshing)refresh().catch(e=>notice('Lecture impossible : '+e.message,true));},20000);
}
init().catch(e=>{notice(e.message,true);$('network').textContent='Réseau indisponible';$('campaign-list').innerHTML='<div class="empty">Le nœud blockchain doit être démarré et les contrats déployés. Consultez le README du projet.</div>';});

$('fund-form').onsubmit=async e=>{e.preventDefault();if(!pendingFunding)return;const {id,amount}=pendingFunding;$('fund-dialog').close();await write('core','contribute',[id],{value:amount});};
let detailRequest=0;
async function eventHistory(eventFilter){
 const tip=await provider.getBlockNumber(),events=[];
 for(let from=cfg.deployedAtBlock;from<=tip;from+=1000)events.push(...await contracts.core.queryFilter(eventFilter,from,Math.min(from+999,tip)));
 return events;
}
async function showProject(id){
 const request=++detailRequest,{c,m,status,contribution,approvals}=campaignData.find(x=>x.id===id);
 const section=(title,value)=>`<section class="research-section"><h3>${title}</h3><p>${esc(value||'Non renseigné par le porteur du projet.')}</p></section>`;
 $('project-details').innerHTML=`<span class="eyebrow">RESEARCH PROJECT #${id}</span><h2>${esc(m.name)}</h2><span class="pill">${esc(m.category)}</span>${m.demo?'<span class="pill">Fictif · démonstration</span>':''}<p class="funding-disclaimer">Informations déclarées par le porteur. La publication et les votes ne constituent pas une validation scientifique.</p>${section('Overview',m.description)}${section('Research Objectives',m.objectives)}${section('Methodology',m.methodology)}${section('Expected Outcomes',m.outcomes)}${section('Research Team',m.team)}${section('Research Milestones · informatifs uniquement',(m.milestones||[]).join(' → '))}<section class="research-section"><h3>Documents · références déclarées</h3>${(m.documents||[]).map(d=>`<p><a href="https://ipfs.io/ipfs/${encodeURIComponent(d.cid)}" target="_blank" rel="noopener noreferrer">${esc(d.name)} ↗</a> · ${esc(d.type)} · ${d.size} octets déclarés</p>`).join('')||'<p>Aucun document associé.</p>'}<small>Disponibilité, format et taille réels non certifiés. Aucun document volumineux sur la blockchain.</small></section><section class="research-section"><h3>Funding Progress · vérifiable on-chain</h3><p>${fmt(c.raised)} / ${fmt(c.goal)} ETH · ${labels[status]}<br>Séquestre : ${fmt(c.escrow)} ETH · Échéance : ${new Date(Number(c.deadline)*1000).toLocaleString('fr-FR')}<br>Limite de versement : ${new Date(campaignData.find(x=>x.id===id).withdrawalDeadline*1000).toLocaleString('fr-FR')}</p></section><section class="research-section"><h3>Governance & Transparency</h3><p>DAO : ${c.releaseApproved?'accordée':'requise'} · Retrait : ${c.withdrawn?'effectué':'non effectué'} · Multisig : ${approvals}/2 (requise au-delà de 1 ETH)</p><p class="mono">Bénéficiaire : ${esc(c.beneficiary)}<br>CID : ${esc(c.metadataCID)}</p><p>Versement après collecte et objectif atteint ; remboursement si échec, annulation ou absence de versement 14 jours après la collecte. Les étapes ne déclenchent aucun paiement.</p></section><section class="research-section"><h3>My Contributions · historique de transactions</h3><p>Contribution nette enregistrée : ${account?fmt(contribution)+' ETH':'connectez votre portefeuille'}</p><div id="project-history">Lecture des événements…</div></section>`;
 $('project-dialog').showModal();
 try{
  const events=await eventHistory(contracts.core.filters.Contribution(id));
  const refunds=account?await eventHistory(contracts.core.filters.Refunded(id,account)):[];
  if(request!==detailRequest)return;
  const mine=account?events.filter(e=>e.args.contributor.toLowerCase()===account.toLowerCase()):[];
  $('project-history').innerHTML=`<p>${new Set(events.map(e=>e.args.contributor.toLowerCase())).size} adresses contributrices uniques (pas une mesure de personnes).</p>`+[...mine,...refunds].sort((a,b)=>a.blockNumber-b.blockNumber).map(e=>`<p class="mono">${e.fragment.name==='Refunded'?'Remboursement':'Contribution'} : ${fmt(e.args.amount)} ETH · bloc ${e.blockNumber}<br>${esc(e.transactionHash)}</p>`).join('');
 }catch{if(request===detailRequest)$('project-history').textContent='Historique indisponible auprès du RPC. Aucun nombre de contributeurs estimé.';}
}

function applyAccess(){
 $('refresh-roles').disabled=busy||!!refreshing;
 $('admin-nav').hidden=!(roles.admin||roles.manager);$('signer-nav').hidden=!roles.signer;
 $('admin-controls').hidden=!roles.admin;$('role-management').hidden=!roles.manager;
 $('pause').disabled=busy||!roles.admin||pausedState;
 $('unpause').disabled=busy||!roles.admin||!pausedState;
 $('open-create').disabled=busy||pausedState;updateProposalEligibility();
 document.querySelectorAll('[data-contribute],[data-withdraw]').forEach(b=>b.disabled=busy||pausedState);
 document.querySelectorAll('[data-refund]').forEach(b=>b.disabled=busy);
 if((!roles.admin&&!roles.manager&&$('administration').classList.contains('active'))||(!roles.signer&&$('treasury').classList.contains('active')))switchTab('workspace');
}
function withdrawalState({c,approvals,status}){
 if(c.withdrawn)return 'Versement effectué';
 if(c.cancelled)return 'Projet annulé';
 if(status===4)return 'Délai de versement expiré : remboursements ouverts';
 if(status===2)return 'Objectif non atteint : remboursements ouverts';
 if(status===0)return 'Collecte en cours';
 if(!c.releaseApproved)return 'En attente de la décision DAO';
 if(c.escrow>threshold&&approvals<2)return `En attente des signataires (${approvals}/2)`;
 if(pausedState)return 'Retrait suspendu : système en pause';
 return 'Prêt pour le retrait par le bénéficiaire';
}
function renderRoles(){
 const names=[];if(roles.manager)names.push('Gestionnaire des rôles');if(roles.admin)names.push('Administrateur');if(roles.signer)names.push('Signataire');
 if(campaignData.some(x=>sameAddress(account,x.c.beneficiary)))names.push('Bénéficiaire');
 if(campaignData.some(x=>x.contribution>0n))names.push('Contributeur');
 $('wallet-roles').textContent=account?(names.join(' · ')||'Membre connecté'):'Visiteur · lecture publique';
 $('role-account').textContent=account||'Connectez MetaMask pour identifier vos droits.';
 $('role-details').innerHTML=[['Administrateur',roles.admin,'Pause et reprise du système'],['Gestionnaire des rôles',roles.manager,'Attribution et révocation du rôle administrateur'],['Signataire',roles.signer,'Approbation ou révocation d’un retrait précis']].map(([name,yes,description])=>`<p><span class="pill">${yes?'Actif':'Non attribué'}</span> <b>${name}</b> — ${description}</p>`).join('');
 $('admin-access').textContent=roles.admin||roles.manager?'Droits lus depuis le contrat CrowdfundingCore.':'Cet espace est réservé aux administrateurs.';
 $('admin-state').textContent=pausedState?'Système en pause':'Système opérationnel';
 $('signer-access').textContent=roles.signer?`Signataire autorisé : ${account}`:'Connectez une des trois adresses autorisées affichées dans Vérifier.';
 const mine=campaignData.filter(x=>sameAddress(account,x.c.beneficiary));
 $('beneficiary-projects').innerHTML=mine.map(x=>`<p><b>${esc(x.m.name)}</b> · #${x.id}<br>${withdrawalState(x)} · ${fmt(x.c.escrow)} ETH <button class="text-button" data-mine="${x.id}">Voir dans Explorer →</button></p>`).join('')||'<p>Aucun projet bénéficiaire parmi les projets chargés.</p>';
 document.querySelectorAll('[data-mine]').forEach(b=>b.onclick=()=>{filter='all';categoryFilter='all';$('category-filter').value='all';document.querySelectorAll('.filter').forEach(x=>x.classList.toggle('selected',x.dataset.filter==='all'));renderCampaigns();applyAccess();switchTab('campaigns');document.querySelector(`[data-detail="${b.dataset.mine}"]`)?.scrollIntoView({block:'center'});});
 const queue=campaignData.filter(x=>x.status===1&&x.c.releaseApproved&&!x.c.cancelled&&!x.c.withdrawn&&x.c.escrow>threshold);
 $('signer-queue').innerHTML=roles.signer?queue.map(({id,c,m,approvals,signatureStates})=>{
  const signed=signatureStates[chainSigners.findIndex(a=>sameAddress(a,account))];
  return `<article class="panel"><span class="pill">${approvals}/2 confirmations</span><h2>${esc(m.name)} · #${id}</h2><p>Montant exact : <b>${formatEther(c.escrow)} ETH</b></p><p class="mono">Bénéficiaire : ${esc(c.beneficiary)}</p>${chainSigners.map((a,i)=>`<p class="mono">${signatureStates[i]?'✓ Approuvé':'○ En attente'} · ${esc(a)}</p>`).join('')}<button class="${signed?'secondary':'primary'}" data-sign="${id}" data-approved="${!signed}">${signed?'Révoquer mon approbation':'Approuver ce retrait'}</button></article>`;
 }).join('')||'<div class="empty">Aucun retrait supérieur à 1 ETH en attente après accord DAO.</div>':'<div class="empty">Aucun droit de signature pour ce portefeuille.</div>';
 document.querySelectorAll('[data-sign]').forEach(b=>b.onclick=async()=>{
  try{const entry=campaignData.find(x=>String(x.id)===b.dataset.sign);if(!entry||!roles.signer)return;
  const fresh=await contracts.core.campaigns(entry.id);
  if(!(await contracts.core.isGovernable(entry.id))||fresh.escrow!==entry.c.escrow||fresh.cancelled||fresh.withdrawn||!fresh.releaseApproved){notice('La campagne a changé. Actualisez avant de signer.',true);await refresh();return;}
  await write('guard','setApproval',[cfg.addresses.core,entry.id,entry.c.beneficiary,entry.c.escrow,b.dataset.approved==='true']);
  }catch(e){notice(e.shortMessage||e.message,true);}
 });
}
$('refresh-roles').onclick=()=>refresh().catch(e=>notice(e.message,true));
$('admin-form').onsubmit=async e=>{
 e.preventDefault();const target=$('admin-address').value.trim();
 if(!roles.manager){notice('Gestionnaire des rôles requis.',true);return;}
 if(!isAddress(target)||/^0x0{40}$/i.test(target)){notice('Adresse non nulle valide requise.',true);return;}
 const grant=e.submitter.value==='grant';
 if(await write('core',grant?'grantRole':'revokeRole',[adminRole,target]))$('admin-members').textContent=`${target} : rôle administrateur ${grant?'attribué':'retiré'}.`;
};

function updateProposalEligibility(){
 const x=campaignData.find(x=>String(x.id)===$('proposal-campaign').value);
 const release=$('proposal-action').querySelector('[value="0"]');release.disabled=!x?.releaseReady;
 if(release.disabled&&$('proposal-action').value==='0')$('proposal-action').value='1';
 let reason='';
 if(!account)reason='Connectez le portefeuille ayant contribué à ce projet.';
 else if(!x)reason='Sélectionnez un projet.';
 else if(!x.governable)reason='Cette campagne est clôturée pour la gouvernance.';
 else if(x.proposerWeight<parseEther('1'))reason='Il faut au moins 1 voix propre à ce projet au dernier bloc terminé (0,001 ETH contribué).';
 else if(chainTime+governanceWindow>=x.withdrawalDeadline)reason='Délai insuffisant pour terminer le vote avant les remboursements de secours.';
 $('proposal-submit').disabled=!!reason||busy;
 $('proposal-eligibility').textContent=reason||`Vos voix propres à ce projet : ${fmt(x.proposerWeight)}. ${x.releaseReady?'Déblocage disponible.':'Annulation possible ; le déblocage exige la fin de collecte, l’objectif atteint et aucune autorisation déjà accordée.'}`;
}
$('proposal-campaign').onchange=updateProposalEligibility;
$('proposal-action').onchange=updateProposalEligibility;
let governanceWindow=0;
async function renderReplacements(){
 $('rotation-panel').hidden=!roles.signer;if(!roles.signer)return;
 const previous=$('replacement-slot').value;
 $('replacement-slot').replaceChildren(...chainSigners.map((a,i)=>new Option(`Signataire ${i+1} · ${a}`,String(i))));
 if(previous)$('replacement-slot').value=previous;
 const [count,epoch]=await Promise.all([contracts.guard.replacementCount(),contracts.guard.signerEpoch()]);
 $('more-replacements').hidden=Number(count)<=replacementLimit;
 const entries=await Promise.all(Array.from({length:Math.min(Number(count),replacementLimit)},async(_,i)=>{
  const id=Number(count)-1-i,r=await contracts.guard.replacements(id);
  const approved=await contracts.guard.replacementApprovedBy(id,account);
  const active=!r.executed&&r.epoch===epoch;
  const ready=active&&r.count>=2n&&r.executableAt>0n&&chainTime>=Number(r.executableAt);
  const state=r.executed?'Remplacement effectué':!active?'Périmé après rotation':r.count<2n?'En attente de deux accords':ready?'Exécutable':`Délai jusqu’au ${new Date(Number(r.executableAt)*1000).toLocaleString('fr-FR')}`;
  return `<article class="panel"><span class="pill">${esc(state)}</span><h3>Remplacement #${id} · signataire ${Number(r.slot)+1}</h3><p class="mono">Nouvelle adresse : ${esc(r.newSigner)}</p><p>${r.count}/2 accords · composition #${r.epoch}</p><div class="actions">${active?`<button class="secondary" data-rotation-vote="${id}" data-approved="${!approved}">${approved?'Révoquer mon accord':'Approuver le remplacement'}</button>`:''}${ready?`<button class="primary" data-rotation-execute="${id}">Exécuter le remplacement</button>`:''}</div></article>`;
 }));
 $('replacement-list').innerHTML=entries.join('')||'<p>Aucun remplacement proposé.</p>';
 document.querySelectorAll('[data-rotation-vote]').forEach(b=>b.onclick=()=>write('guard','approveReplacement',[b.dataset.rotationVote,b.dataset.approved==='true']));
 document.querySelectorAll('[data-rotation-execute]').forEach(b=>b.onclick=()=>write('guard','executeReplacement',[b.dataset.rotationExecute]));
}
$('more-replacements').onclick=()=>{replacementLimit+=24;refresh().catch(e=>notice(e.message,true));};
$('replacement-form').onsubmit=async e=>{
 e.preventDefault();const address=$('replacement-address').value.trim();
 if(!roles.signer||!isAddress(address)||/^0x0{40}$/i.test(address)||chainSigners.some(a=>sameAddress(a,address))){notice('Choisissez une nouvelle adresse valide, différente des trois signataires actuels.',true);return;}
 await write('guard','proposeReplacement',[Number($('replacement-slot').value),address]);
};
