const {chromium}=require('playwright');const fs=require('fs');const assert=require('node:assert/strict');
(async()=>{
 const packaged=require('@sparticuz/chromium').default;
 const browser=await chromium.launch({headless:true,executablePath:await require('./browser-path.cjs')(),args:packaged.args});
 const page=await browser.newPage({viewport:{width:1440,height:1100},deviceScaleFactor:1});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:5173');await page.locator('.card').first().waitFor({timeout:60000});
 await page.waitForFunction(()=>document.querySelectorAll('.card').length===4);
 assert.equal(await page.locator('.card').count(),4);
 await page.locator('#proof-details summary').click();
 await page.waitForFunction(()=>/Versement de 1,8 ETH.*bloc.*0x[a-f0-9]{64}/i.test(document.getElementById('proof-chain').textContent));
 await page.selectOption('#proof-campaign','1');
 await page.waitForFunction(()=>/Création de la campagne.*bloc.*0x[a-f0-9]{64}/i.test(document.getElementById('proof-chain').textContent));
 assert.match(await page.locator('#proof-state').innerText(),/en attente/);
 await page.selectOption('#proof-campaign','0');
 await page.waitForFunction(()=>/Versement de 1,8 ETH/.test(document.getElementById('proof-chain').textContent));
 await page.locator('#proof-details summary').click();

 await page.screenshot({path:'docs/evidence/interface-campagnes.png',fullPage:true});
 await page.screenshot({path:'docs/evidence/interface-apercu.png',fullPage:false});
 await page.locator('.card').nth(1).screenshot({path:'docs/evidence/detail-campagne.png'});
 await page.selectOption('#category-filter','Cybersecurity');assert.equal(await page.locator('.card').count(),1);await page.selectOption('#category-filter','all');
 await page.click('[data-detail="0"]');await page.locator('#project-history').getByText(/adresses contributrices/).waitFor();assert.match(await page.locator('#project-details').innerText(),/Research Objectives/);assert.match(await page.locator('#project-details').innerText(),/fictive/);await page.click('#project-dialog [data-close]');
 await page.click('#hero-guide');assert.equal(await page.locator('#guide').isVisible(),true);await page.click('[data-tab="campaigns"]');
 await page.click('[data-filter="3"]');assert.equal(await page.locator('.card').count(),1);await page.click('[data-filter="all"]');
 await page.click('[data-tab="governance"]');await page.locator('.proposal').first().waitFor();assert.equal(await page.locator('.proposal').count(),3);
 await page.screenshot({path:'docs/evidence/interface-gouvernance.png',fullPage:true});
 await page.locator('.proposal').nth(0).screenshot({path:'docs/evidence/detail-vote.png'});
 await page.click('[data-tab="transparency"]');await page.screenshot({path:'docs/evidence/interface-transparence.png',fullPage:true});
 assert.match(await page.locator('#anomalies').innerText(),/REPETITION/);
 await page.click('[data-tab="campaigns"]');await page.click('#open-create');assert.equal(await page.locator('#create-dialog').evaluate(e=>e.open),true);await page.click('#create-dialog [data-close]');
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'docs/evidence/interface-mobile.png',fullPage:true});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'débordement horizontal mobile');
 await page.click('#connect');assert.match(await page.locator('#notice').innerText(),/MetaMask/);
 // Fournisseur EIP-1193 de test relié au nœud local : pas une extension MetaMask.
 await page.setViewportSize({width:1440,height:1100});
 await page.addInitScript(()=>{
  let id=1;window.ethereum={request:async({method,params=[]})=>{
   if(method==='eth_requestAccounts')method='eth_accounts';
   const r=await fetch('http://127.0.0.1:8545',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:id++,method,params})});const data=await r.json();if(data.error)throw Error(data.error.message);return data.result;
  },on:()=>{}};
 });
 await page.reload();await page.locator('.card').first().waitFor();await page.click('#connect');await page.waitForFunction(()=>document.getElementById('connect').textContent.includes('…'));
 await page.fill('#amount-1','0.001');await page.click('[data-contribute="1"]');await page.check('#fund-form input[type=checkbox]');await page.click('#fund-form button[type=submit]');await page.waitForFunction(()=>document.getElementById('notice').textContent.startsWith('Transaction confirmée')||document.getElementById('notice').classList.contains('error'));
 assert.match(await page.locator('#notice').innerText(),/^Transaction confirmée/);
 await page.click('#open-create');await page.fill('#campaign-name','UI Research Project');await page.fill('#campaign-description','Created in automated ResearchFund validation');await page.selectOption('#campaign-category','Open Science');
 for(const key of ['objectives','methodology','outcomes','team'])await page.fill('#campaign-'+key,'Research '+key);
 await page.fill('#campaign-goal','0.5');await page.fill('#campaign-milestones','Plan\nPublish');await page.check('#create-form input[type=checkbox]');await page.click('#create-form button[type=submit]');await page.waitForFunction(()=>!document.getElementById('create-dialog').open);assert.equal(await page.locator('.card').count(),5);
 await page.click('[data-detail="4"]');assert.match(await page.locator('#project-details').innerText(),/Research methodology/);await page.click('#project-dialog [data-close]');
 assert.equal(errors.length,0,errors.join('\n'));
 fs.writeFileSync('docs/evidence/ui-tests.txt','ResearchFund : catégorie, détail scientifique, création IPFS/on-chain et confirmation de don validés. UI vérifiée : 4 campagnes réelles, filtres, 3 propositions, alertes, formulaire, mobile 390px sans débordement, absence de wallet, connexion EIP-1193 injectée et contribution réelle de 0.001 ETH.\nAucune erreur JavaScript non interceptée.\nMetaMask réel : validation manuelle restant à réaliser dans le navigateur de l’étudiant.\n');
 await browser.close();console.log('UI et transaction EIP-1193 validées.');
})().catch(e=>{console.error(e);process.exit(1)});
