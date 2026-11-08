const {ethers,network}=require('hardhat');const fs=require('fs');
const E=ethers.parseEther;
async function main(){
 if((await ethers.provider.getNetwork()).chainId!==31337n)throw Error('Démonstration réservée à Hardhat local');
 const cfg=JSON.parse(fs.readFileSync('deployments/localhost.json'));const [admin,alice,bob,beneficiary,s1,s2]=await ethers.getSigners();
 const core=await ethers.getContractAt('CrowdfundingCore',cfg.addresses.core),dao=await ethers.getContractAt('FundingDAO',cfg.addresses.dao),guard=await ethers.getContractAt('TreasuryGuard',cfg.addresses.guard);
 if(await core.campaignCount()!==0n)throw Error('Redéployer avant de rejouer la démo');
 const data=[
  {name:'Smart Agriculture AI',description:'Démonstration fictive : irrigation intelligente par apprentissage automatique et capteurs IoT.',category:'Artificial Intelligence',goal:'1.8',objectives:'Réduire la consommation d’eau sur une parcelle expérimentale.',methodology:'Comparer une commande par seuil et un modèle prédictif sur des données synthétiques.',outcomes:'Prototype et protocole de mesure reproductible.'},
  {name:'Solar Energy Optimization',description:'Démonstration fictive : optimisation de la production photovoltaïque.',category:'Renewable Energy',goal:'2',objectives:'Évaluer plusieurs stratégies de suivi de production solaire.',methodology:'Simulations et comparaison sur séries temporelles ouvertes.',outcomes:'Benchmark et documentation des limites.'},
  {name:'AI-Assisted Medical Imaging',description:'Prototype fictif destiné à la recherche ; aucun usage clinique ni diagnostic.',category:'Healthcare & Biotechnology',goal:'1',objectives:'Étudier la robustesse d’un classifieur sur des images publiques anonymisées.',methodology:'Séparation entraînement/test, analyse des biais et évaluation expérimentale.',outcomes:'Rapport de recherche sans validation clinique.'},
  {name:'Open Cybersecurity Research Lab',description:'Laboratoire fictif open source de cybersécurité défensive ; annulation pédagogique, sans accusation réelle.',category:'Cybersecurity',goal:'4',objectives:'Construire des exercices défensifs reproductibles.',methodology:'Journaux synthétiques, règles de détection et validation en environnement isolé.',outcomes:'Scénarios et documentation open source.'}
 ].map(m=>({...m,demo:true,team:'Équipe universitaire fictive · ResearchFund Demo',milestones:['Research Planning','Prototype Development','Experimental Validation','Results Publication'],documents:[]}));
 for(const [index,m] of data.entries()){
  const r=await fetch('http://127.0.0.1:8787/add',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(m)});if(!r.ok)throw Error(await r.text());const {cid}=await r.json();
  await(await core.createCampaign(E(m.goal),index===0?3600:86400*7,beneficiary.address,cid)).wait();
 }
 async function contribute(id,who,value){await(await core.connect(who).contribute(id,{value:E(value)})).wait();}
 await contribute(0,alice,'1.2');await contribute(0,bob,'0.6');
 for(let i=0;i<4;i++)await contribute(1,alice,'0.1');await contribute(1,bob,'0.15');
 await contribute(2,bob,'0.25');await contribute(3,alice,'0.2');await contribute(3,bob,'0.1');
 await network.provider.send('evm_increaseTime',[3601]);await network.provider.send('evm_mine');
 await(await dao.connect(alice).propose(0,0)).wait();await(await dao.connect(alice).vote(0,true)).wait();await(await dao.connect(bob).vote(0,true)).wait();
 await(await dao.connect(alice).propose(3,1)).wait();await(await dao.connect(alice).vote(1,true)).wait();
 await network.provider.send('evm_increaseTime',[4201]);await network.provider.send('evm_mine');
 await(await dao.execute(0)).wait();await(await dao.execute(1)).wait();
 await(await guard.connect(s1).setApproval(core.target,0,beneficiary.address,E('1.8'),true)).wait();
 await(await guard.connect(s2).setApproval(core.target,0,beneficiary.address,E('1.8'),true)).wait();
 await(await core.connect(beneficiary).withdrawFunds(0)).wait();await(await core.connect(alice).refund(3)).wait();
 await(await dao.connect(alice).propose(1,1)).wait();await(await dao.connect(alice).vote(2,true)).wait();
 console.log('4 campagnes, 3 propositions, 1 retrait multisig, 1 remboursement exécutés sur Hardhat.');
 console.log('Comptes démo (clés publiques de test Hardhat uniquement) :',JSON.stringify({admin:admin.address,alice:alice.address,bob:bob.address,beneficiary:beneficiary.address,signers:cfg.signers},null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1});
