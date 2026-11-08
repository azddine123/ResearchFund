const {expect}=require('chai');
const {ethers,network}=require('hardhat');
const E=ethers.parseEther;
const CID='bafkreiaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const advance=async(seconds)=>{await network.provider.send('evm_increaseTime',[seconds]);await network.provider.send('evm_mine');};

describe('ResearchFund — règles 1 à 6 et régressions',function(){
 let admin,alice,bob,beneficiary,s1,s2,s3,outsider,core,token,dao,guard;
 beforeEach(async()=>{
  [admin,alice,bob,beneficiary,s1,s2,s3,outsider]=await ethers.getSigners();
  guard=await (await ethers.getContractFactory('TreasuryGuard')).deploy([s1.address,s2.address,s3.address]);
  core=await (await ethers.getContractFactory('CrowdfundingCore')).deploy(admin.address,guard.target);
  token=await ethers.getContractAt('CFDToken',await core.token());
  dao=await (await ethers.getContractFactory('FundingDAO')).deploy(core.target,3600,600);
  await core.configureGovernance(dao.target);
 });
 async function create(goal='0.5',duration=86400,who=beneficiary.address){const id=await core.campaignCount();await core.createCampaign(E(goal),duration,who,CID);return id;}
 async function fund(id,who=alice,amount='0.5'){await core.connect(who).contribute(id,{value:E(amount)});}
 async function proposal(id,action=1){const p=await dao.proposalCount();await dao.connect(alice).propose(id,action);return p;}
 async function approve(id,action=0){if(action===0){const c=await core.campaigns(id);const now=(await ethers.provider.getBlock('latest')).timestamp;if(now<Number(c.deadline))await advance(Number(c.deadline)-now); }const p=await proposal(id,action);await dao.connect(alice).vote(p,true);await advance(4201);await dao.execute(p);return p;}
 it('M1 : frappe proportionnelle, auto-délégation, aucune frappe publique',async()=>{
  const id=await create();await fund(id);expect(await token.balanceOf(alice)).to.equal(E('500'));expect(await token.getVotes(alice)).to.equal(E('500'));
  await expect(token.connect(alice).mint(alice.address,1)).to.be.revertedWithCustomError(token,'OnlyCore');
  await expect(token.connect(alice).burn(alice.address,1)).to.be.revertedWithCustomError(token,'OnlyCore');
 });
 it('CFD personnel : transferts et délégation à un tiers refusés',async()=>{
  const id=await create();await fund(id);
  await expect(token.connect(alice).transfer(bob.address,1)).to.be.revertedWithCustomError(token,'NonTransferable');
  await expect(token.connect(alice).delegate(bob.address)).to.be.revertedWithCustomError(token,'SelfDelegationOnly');
  await token.connect(alice).approve(bob.address,1);
  await expect(token.connect(bob).transferFrom(alice.address,bob.address,1)).to.be.revertedWithCustomError(token,'NonTransferable');
 });
 it('M2 : objectif, durée, bénéficiaire et CID contrôlés',async()=>{
  await expect(core.createCampaign(0,3600,beneficiary.address,CID)).to.be.reverted;
  await expect(core.createCampaign(1,3599,beneficiary.address,CID)).to.be.reverted;
  await expect(core.createCampaign(1,86400*91,beneficiary.address,CID)).to.be.reverted;
  await expect(core.createCampaign(1,3600,ethers.ZeroAddress,CID)).to.be.reverted;
  await expect(core.createCampaign(1,3600,beneficiary.address,'fake')).to.be.reverted;
  const id=await create();expect((await core.campaigns(id)).metadataCID).to.equal(CID);
 });
 it('M2 : contribution nulle ou campagne inexistante refusée',async()=>{
  const id=await create();await expect(core.connect(alice).contribute(id)).to.be.reverted;
  await expect(core.connect(alice).contribute(999,{value:1})).to.be.revertedWith('unknown campaign');
 });
 it('M2 : transition En cours -> Réussie à échéance, retrait encore bloqué',async()=>{
  const id=await create('0.5',3600);await fund(id);expect(await core.status(id)).to.equal(0);
  await advance(3601);expect(await core.status(id)).to.equal(1);
  await expect(core.connect(beneficiary).withdrawFunds(id)).to.be.revertedWith('not authorized');
 });
 it('M2 : Échouée -> remboursement exact + destruction CFD + pas de double remboursement',async()=>{
  const id=await create('2',3600);await fund(id);await advance(3601);expect(await core.status(id)).to.equal(2);
  await expect(core.connect(alice).refund(id)).to.changeEtherBalances([core,alice],[-E('0.5'),E('0.5')]);
  expect(await token.balanceOf(alice)).to.equal(0);expect(await core.totalEscrow()).to.equal(0);
  await expect(core.connect(alice).refund(id)).to.be.revertedWith('nothing to refund');
 });
 it('Refus d’ETH : rollback intégral puis remboursement possible',async()=>{
  const actor=await (await ethers.getContractFactory('ReentrantActor')).deploy(core.target);
  const id=await create('2',3600);await actor.fund(id,{value:E('0.3')});await advance(3601);await actor.setReject(true);
  await expect(actor.claim()).to.be.revertedWith('refund transfer failed');
  expect(await core.contributions(id,actor.target)).to.equal(E('0.3'));expect(await token.balanceOf(actor.target)).to.equal(E('300'));
  await actor.setReject(false);await actor.claim();expect(await core.totalEscrow()).to.equal(0);
 });
 it('Attaque réelle de réentrance sur refund : tentative observée et rejetée',async()=>{
  const actor=await (await ethers.getContractFactory('ReentrantActor')).deploy(core.target);
  const id=await create('2',3600);await actor.fund(id,{value:E('0.3')});await fund(id,bob,'0.4');await advance(3601);
  await actor.claim();expect(await actor.attempted()).to.equal(true);expect(await actor.reentrySucceeded()).to.equal(false);
  expect(await ethers.provider.getBalance(actor.target)).to.equal(E('0.3'));expect(await core.totalEscrow()).to.equal(E('0.4'));
 });
 it('M3 : versement après collecte et objectif, clôture des contributions',async()=>{
  const id=await create('0.5');await fund(id);await approve(id);
  expect(await core.status(id)).to.equal(1);await expect(core.connect(bob).contribute(id,{value:1})).to.be.reverted;
  await expect(core.connect(beneficiary).withdrawFunds(id)).to.changeEtherBalances([core,beneficiary],[-E('0.5'),E('0.5')]);
  await expect(core.connect(beneficiary).withdrawFunds(id)).to.be.reverted;await expect(core.connect(alice).refund(id)).to.be.reverted;
 });
 it('Attaque réelle de réentrance sur withdraw : échec et autres campagnes intactes',async()=>{
  const actor=await (await ethers.getContractFactory('ReentrantActor')).deploy(core.target);
  const id=await create('0.5',86400,actor.target);await fund(id);const other=await create();await fund(other,bob,'0.2');
  await approve(id);await actor.withdraw(id);expect(await actor.attempted()).to.equal(true);expect(await actor.reentrySucceeded()).to.equal(false);
  expect(await core.totalEscrow()).to.equal(E('0.2'));
 });
 it('M3 : gel = Annulée, restitution ouverte, retrait impossible',async()=>{
  const id=await create();await fund(id);await approve(id,1);expect(await core.status(id)).to.equal(3);
  await core.connect(alice).refund(id);await expect(core.connect(beneficiary).withdrawFunds(id)).to.be.reverted;
 });
 it('Tout ou rien : déblocage refusé avant échéance et sous objectif',async()=>{
  const id=await create('2',3600);await fund(id);
  await expect(dao.connect(alice).propose(id,0)).to.be.revertedWith('release not ready');
  await advance(3601);await expect(dao.connect(alice).propose(id,0)).to.be.revertedWith('campaign closed');
 });
 it('Contrôle d’accès : Admin ne peut ni forcer la DAO ni retirer les fonds',async()=>{
  const id=await create();await fund(id);
  await expect(core.authorizeRelease(id)).to.be.revertedWith('only governance');
  await expect(core.cancelByGovernance(id)).to.be.revertedWith('only governance');
  await expect(core.withdrawFunds(id)).to.be.revertedWith('not beneficiary');
  await expect(core.connect(outsider).pause()).to.be.reverted;
  await expect(core.configureGovernance(dao.target)).to.be.reverted;
 });
 it('Circuit breaker : création/contribution/retrait suspendus, reprise',async()=>{
  const id=await create();await fund(id);await approve(id);await core.pause();
  await expect(core.connect(beneficiary).withdrawFunds(id)).to.be.revertedWithCustomError(core,'EnforcedPause');
  await expect(core.connect(alice).contribute(id,{value:1})).to.be.revertedWithCustomError(core,'EnforcedPause');
  await expect(core.connect(alice).refund(id)).to.be.revertedWith('not refundable');
  await expect(create()).to.be.revertedWithCustomError(core,'EnforcedPause');
  await core.unpause();await core.connect(beneficiary).withdrawFunds(id);
 });
 it('La DAO peut geler pendant une pause ; remboursements sans reprise',async()=>{
  const id=await create();await fund(id);const p=await proposal(id,1);await dao.connect(alice).vote(p,true);await core.pause();await advance(4201);await dao.execute(p);
  expect(await core.status(id)).to.equal(3);await core.connect(alice).refund(id);
 });
 it('Snapshot : acquisition APRÈS proposition = aucun nouveau vote',async()=>{
  const id=await create();await fund(id);const p=await proposal(id);await fund(id,bob,'3');
  await expect(dao.connect(bob).vote(p,true)).to.be.revertedWith('no snapshot votes');
  await fund(id,alice,'1');await dao.connect(alice).vote(p,true);expect((await dao.proposals(p)).yes).to.equal(E('500'));
 });
 it('Snapshot même bloc : la frappe ne permet pas de proposer immédiatement',async()=>{
  const id=await create();await network.provider.send('evm_setAutomine',[false]);
  try {
   const n=await alice.getNonce();const tx1=await core.connect(alice).contribute(id,{value:E('1'),nonce:n,gasLimit:600000});
   const tx2=await dao.connect(alice).propose(id,1,{nonce:n+1,gasLimit:600000});
   await network.provider.send('evm_mine');await tx1.wait();const receipt=await ethers.provider.getTransactionReceipt(tx2.hash);expect(receipt.status).to.equal(0);
  } finally {await network.provider.send('evm_setAutomine',[true]);}
 });
 it('Vote unique, délai de scrutin et délai d’exécution effectifs',async()=>{
  const id=await create();await fund(id);const p=await proposal(id);await dao.connect(alice).vote(p,true);
  await expect(dao.connect(alice).vote(p,true)).to.be.revertedWith('already voted');
  await expect(dao.execute(p)).to.be.revertedWith('not executable');await advance(3601);
  await expect(dao.execute(p)).to.be.revertedWith('not executable');await expect(dao.connect(bob).vote(p,true)).to.be.revertedWith('vote closed');
  await advance(600);await dao.connect(outsider).execute(p);await expect(dao.execute(p)).to.be.revertedWith('not executable');
 });
 it('Quorum non atteint malgré 100 % de oui parmi les votants : rejet',async()=>{
  const id=await create('20');await fund(id,alice,'0.1');await fund(id,bob,'1');const p=await proposal(id);await dao.connect(alice).vote(p,true);await advance(4201);
  await expect(dao.execute(p)).to.be.revertedWith('proposal rejected');
 });
 it('Égalité oui/non : rejet',async()=>{
  const id=await create();await fund(id);await fund(id,bob);const p=await proposal(id);await dao.connect(alice).vote(p,true);await dao.connect(bob).vote(p,false);await advance(4201);
  await expect(dao.execute(p)).to.be.revertedWith('proposal rejected');
 });
 it('Multisig > 1 ETH : deux signataires distincts, autorisation liée au montant',async()=>{
  const id=await create('1.5');await fund(id,alice,'1.5');await approve(id);
  await expect(core.connect(beneficiary).withdrawFunds(id)).to.be.revertedWith('multisig required');
  await guard.connect(s1).setApproval(core.target,id,beneficiary.address,E('1.5'),true);
  await expect(guard.connect(s1).setApproval(core.target,id,beneficiary.address,E('1.5'),true)).to.be.revertedWith('unchanged');
  await expect(core.connect(beneficiary).withdrawFunds(id)).to.be.revertedWith('multisig required');
  await guard.connect(s2).setApproval(core.target,id,beneficiary.address,E('1.4'),true);
  await expect(core.connect(beneficiary).withdrawFunds(id)).to.be.revertedWith('multisig required');
  await guard.connect(s2).setApproval(core.target,id,beneficiary.address,E('1.5'),true);
  await core.connect(beneficiary).withdrawFunds(id);
 });
 it('Multisig : révocation, non-signataire, signataires dupliqués refusés',async()=>{
  await expect((await ethers.getContractFactory('TreasuryGuard')).deploy([s1.address,s1.address,s3.address])).to.be.reverted;
  await expect(guard.connect(outsider).setApproval(core.target,0,beneficiary.address,1,true)).to.be.revertedWith('not signer');
  await guard.connect(s1).setApproval(core.target,0,beneficiary.address,1,true);await guard.connect(s1).setApproval(core.target,0,beneficiary.address,1,false);
  expect(await guard.isApproved(core.target,0,beneficiary.address,1)).to.equal(false);
 });
 it('Seuil exact de 1 ETH : DAO obligatoire, multisig non exigée',async()=>{
  const id=await create();await fund(id,alice,'1');await approve(id);await core.connect(beneficiary).withdrawFunds(id);
 });
 it('Gel prioritaire sur autorisation non retirée, puis remboursement',async()=>{
  const id=await create();await fund(id);await approve(id);await approve(id,1);
  await expect(core.connect(beneficiary).withdrawFunds(id)).to.be.revertedWith('not authorized');await core.connect(alice).refund(id);
 });
 it('Snapshot après destruction : pouvoir ancien conservé, nouvelles propositions sans votes',async()=>{
  const id=await create('2',3600);await fund(id);const p=await proposal(id,1);await advance(3601);await core.connect(alice).refund(id);
  const snap=(await dao.proposals(p)).snapshotBlock;expect(await token.getPastVotes(alice.address,snap)).to.equal(E('500'));
  await expect(dao.connect(alice).propose(id,1)).to.be.revertedWith('campaign closed');
 });
 it('Fuzzing déterministe : 64 montants, 4 campagnes, conservation ETH et CFD (seed 0xC0FFEE)',async()=>{
  let seed=0xC0FFEE;const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed;};
  const ids=[];for(let i=0;i<4;i++)ids.push(await create('100',3600));
  const users=[alice,bob,outsider];let total=0n;
  for(let i=0;i<64;i++){
   const u=users[rand()%3],id=ids[rand()%4],amount=BigInt(rand()%1000000+1)*10n**9n;
   await core.connect(u).contribute(id,{value:amount});total+=amount;
   expect(await core.totalEscrow()).to.equal(total);expect(await ethers.provider.getBalance(core.target)).to.equal(total);
   expect(await token.totalSupply()).to.equal(total*1000n);
  }
  await advance(3601);
  for(const id of ids)for(const u of users){const amount=await core.contributions(id,u.address);if(amount>0n)await core.connect(u).refund(id);}
  expect(await core.totalEscrow()).to.equal(0);expect(await token.totalSupply()).to.equal(0);expect(await ethers.provider.getBalance(core.target)).to.equal(0);
 });
});
