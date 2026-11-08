const {chromium}=require('playwright');
const {JsonRpcProvider,Contract,parseEther}=require('ethers');
const assert=require('node:assert/strict');const fs=require('fs');
const cfg=require('../frontend/public/config.json');
(async()=>{
 const provider=new JsonRpcProvider('http://127.0.0.1:8545');const wallets=await provider.listAccounts();
 const core=new Contract(cfg.addresses.core,cfg.abis.core, wallets[0]);const dao=new Contract(cfg.addresses.dao,cfg.abis.dao,wallets[1]);
 const id=await core.campaignCount();
 const metaResponse=await fetch('http://127.0.0.1:8787/add',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Validation des rôles V2',description:'Projet fictif pour tester le financement tout ou rien.',category:'Open Science'})});assert.ok(metaResponse.ok);const {cid}=await metaResponse.json();
 await(await core.createCampaign(parseEther('1'),3600, wallets[3].address,cid)).wait();
 await(await core.connect(wallets[1]).contribute(id,{value:parseEther('1.2')})).wait();await provider.send('evm_mine',[]);
 await provider.send('evm_increaseTime',[3601]);await provider.send('evm_mine',[]);
 const pid=await dao.proposalCount();await(await dao.propose(id,0)).wait();await(await dao.vote(pid,true)).wait();await provider.send('evm_increaseTime',[4201]);await provider.send('evm_mine',[]);await(await dao.execute(pid)).wait();
 const browser=await chromium.launch({headless:true,executablePath:await require('./browser-path.cjs')(),args:require('@sparticuz/chromium').default.args});
 const errors=[];
 async function open(index){
  const context=await browser.newContext({viewport:{width:1440,height:1000}});
  await context.addInitScript(({address})=>{let id=0;window.ethereum={on:()=>{},request:async({method,params=[]})=>{
   if(method==='eth_accounts'||method==='eth_requestAccounts')return address?[address]:[];
   const r=await fetch('http://127.0.0.1:8545',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:++id,method,params})});const d=await r.json();if(d.error)throw Error(d.error.message);return d.result;
  }};},{address:index===null?null:wallets[index].address});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:5173');await page.waitForFunction(()=>document.getElementById('role-account').textContent.length>0,{},{timeout:60000});return page;
 }
 async function tx(page,selector){const previous=await page.locator('#notice').textContent();await page.click(selector);await page.waitForFunction(previous=>document.getElementById('notice').textContent!==previous&&document.getElementById('notice').textContent.startsWith('Transaction confirmée')&&!document.getElementById('refresh-roles').disabled,previous,{timeout:30000});assert.ok(!(await page.locator('#notice').getAttribute('class')).includes('error'));}
 const visitor=await open(null);assert.equal(await visitor.locator('#admin-nav').isVisible(),false);assert.equal(await visitor.locator('#signer-nav').isVisible(),false);assert.equal(await visitor.locator('[data-withdraw]').count(),0);
 const member=await open(8);assert.equal(await member.locator('#admin-nav').isVisible(),false);assert.equal(await member.locator('#signer-nav').isVisible(),false);
 const admin=await open(0);await admin.click('#admin-nav');await admin.click('#refresh-roles');await tx(admin,'#pause');assert.equal(await core.paused(),true);assert.equal(await admin.locator('#pause').isDisabled(),true);await tx(admin,'#unpause');assert.equal(await core.paused(),false);
 await admin.fill('#admin-address',wallets[8].address);await tx(admin,'#admin-form button[value="grant"]');await member.click('#refresh-roles');await member.locator('#admin-nav').waitFor();await member.click('#admin-nav');assert.equal(await member.locator('#role-management').isVisible(),false);
 await tx(admin,'#admin-form button[value="revoke"]');await member.click('#refresh-roles');await member.locator('#admin-nav').waitFor({state:'hidden'});
 await admin.screenshot({path:'docs/evidence/roles-admin.png',fullPage:true});
 const beneficiary=await open(3);assert.equal(await beneficiary.locator(`[data-withdraw="${id}"]`).count(),0);
 const s1=await open(4);await s1.click('#signer-nav');await tx(s1,`[data-sign="${id}"]`);assert.equal(await s1.locator(`[data-sign="${id}"]`).innerText(),'Révoquer mon approbation');await tx(s1,`[data-sign="${id}"]`);assert.equal(await s1.locator(`[data-sign="${id}"]`).innerText(),'Approuver ce retrait');await tx(s1,`[data-sign="${id}"]`);
 const s2=await open(5);await s2.click('#signer-nav');await tx(s2,`[data-sign="${id}"]`);await s2.screenshot({path:'docs/evidence/roles-signataire.png',fullPage:true});
 await beneficiary.click('#refresh-roles');await beneficiary.locator(`[data-withdraw="${id}"]`).waitFor();await tx(beneficiary,`[data-withdraw="${id}"]`);assert.equal((await core.campaigns(id)).withdrawn,true);
 await s2.click('#refresh-roles');await s2.locator(`[data-sign="${id}"]`).waitFor({state:'detached'});
 await s1.setViewportSize({width:390,height:844});assert.equal(await s1.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 // Deuxième campagne : rotation réelle puis remboursement de secours en pause.
 const rescue=await core.campaignCount();await(await core.createCampaign(parseEther('1'),3600,wallets[3].address,cid)).wait();
 await(await core.connect(wallets[1]).contribute(rescue,{value:parseEther('1.2')})).wait();
 await provider.send('evm_increaseTime',[3601]);await provider.send('evm_mine',[]);
 const rescuePid=await dao.proposalCount();await(await dao.propose(rescue,0)).wait();await(await dao.vote(rescuePid,true)).wait();await provider.send('evm_increaseTime',[4201]);await provider.send('evm_mine',[]);await(await dao.execute(rescuePid)).wait();
 await s1.setViewportSize({width:1440,height:1000});await s1.click('#refresh-roles');await s1.locator(`[data-sign="${rescue}"]`).waitFor();await tx(s1,`[data-sign="${rescue}"]`);
 await s2.click('#refresh-roles');await s2.locator(`[data-sign="${rescue}"]`).waitFor();await tx(s2,`[data-sign="${rescue}"]`);
 await s1.selectOption('#replacement-slot','0');await s1.fill('#replacement-address',wallets[8].address);await tx(s1,'#replacement-form button[type="submit"]');
 await s2.click('#refresh-roles');await s2.locator('[data-rotation-vote="0"]').waitFor();await tx(s2,'[data-rotation-vote="0"]');
 assert.equal(await s2.locator('[data-rotation-execute="0"]').count(),0);
 await tx(s2,'[data-rotation-vote="0"]');await tx(s2,'[data-rotation-vote="0"]');
 await provider.send('evm_increaseTime',[172801]);await provider.send('evm_mine',[]);await s2.click('#refresh-roles');await s2.locator('[data-rotation-execute="0"]').waitFor();await tx(s2,'[data-rotation-execute="0"]');
 const guard=new Contract(cfg.addresses.guard,cfg.abis.guard,provider);assert.equal(await guard.isSigner(wallets[8].address),true);
 const key=await guard.withdrawalKey(cfg.addresses.core,rescue,wallets[3].address,parseEther('1.2'));assert.equal(await guard.approvals(key),0n);
 await s1.click('#refresh-roles');await s1.locator('#signer-nav').waitFor({state:'hidden'});
 await member.click('#refresh-roles');await member.locator('#signer-nav').waitFor();await member.click('#signer-nav');await tx(member,`[data-sign="${rescue}"]`);
 await s2.click('#refresh-roles');await s2.waitForFunction(id=>document.querySelector(`[data-sign="${id}"]`)?.textContent==='Approuver ce retrait',String(rescue));await tx(s2,`[data-sign="${rescue}"]`);
 await member.screenshot({path:'docs/evidence/v2-rotation.png',fullPage:true});
 const end=await core.withdrawalDeadline(rescue);await provider.send('evm_setNextBlockTimestamp',[Number(end)]);await provider.send('evm_mine',[]);
 await admin.click('#refresh-roles');await admin.locator('#pause').waitFor();await tx(admin,'#pause');
 const donor=await open(1);const refund=donor.locator(`[data-refund="${rescue}"]`);await refund.waitFor();assert.equal(await refund.isDisabled(),false);await tx(donor,`[data-refund="${rescue}"]`);assert.equal(await core.contributions(rescue,wallets[1].address),0n);
 await beneficiary.click('#refresh-roles');await beneficiary.locator(`[data-withdraw="${rescue}"]`).waitFor({state:'detached'});assert.equal(await beneficiary.locator(`[data-withdraw="${rescue}"]`).count(),0);
 await donor.screenshot({path:'docs/evidence/v2-secours.png',fullPage:true});
 assert.deepEqual(errors,[]);await browser.close();
 fs.writeFileSync('docs/evidence/roles-tests.txt','PASS : visiteur, membre, admin, gestionnaire des rôles, bénéficiaire, deux signataires.\nPASS : pause/reprise, attribution/révocation ADMIN_ROLE et actualisation des droits.\nPASS : approbation, révocation, 2 signatures distinctes et retrait du bénéficiaire de 1.2 ETH.\nPASS : aucun bouton de retrait tiers, file actualisée après retrait, mobile 390px, aucune erreur JS.\nPASS : rotation avec révocation, délai de 48 h, nouveaux droits, anciennes signatures invalidées et nouvelles signatures.\nPASS : secours après 14 jours, bouton de remboursement actif en pause, remboursement réel, aucun retrait expiré.\nFournisseur EIP-1193 de test ; extension MetaMask réelle non testée.\n');console.log('Rôles et parcours 2-sur-3 validés.');
})().catch(e=>{console.error(e);process.exit(1)});
