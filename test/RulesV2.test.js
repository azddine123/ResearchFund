const {expect}=require('chai');const {ethers,network}=require('hardhat');
const E=ethers.parseEther,CID='bafkreiaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
describe('ResearchFund V2 — isolation, secours et rotation',function(){
 let admin,a,b,beneficiary,s1,s2,s3,next,core,dao,guard,token;
 const jump=async seconds=>{await network.provider.send('evm_increaseTime',[seconds]);await network.provider.send('evm_mine');};
 const at=async time=>{await network.provider.send('evm_setNextBlockTimestamp',[Number(time)]);};
 beforeEach(async()=>{
  [admin,a,b,beneficiary,s1,s2,s3,next]=await ethers.getSigners();
  guard=await(await ethers.getContractFactory('TreasuryGuard')).deploy([s1.address,s2.address,s3.address]);
  core=await(await ethers.getContractFactory('CrowdfundingCore')).deploy(admin.address,guard.target);
  dao=await(await ethers.getContractFactory('FundingDAO')).deploy(core.target,3600,600);
  token=await ethers.getContractAt('CFDToken',await core.token());await core.configureGovernance(dao.target);
 });
 async function create(goal='1'){const id=await core.campaignCount();await core.createCampaign(E(goal),3600,beneficiary.address,CID);return id;}
 async function fund(id,who=a,amount='1'){await core.connect(who).contribute(id,{value:E(amount)});}
 async function release(id){const c=await core.campaigns(id);const now=(await ethers.provider.getBlock('latest')).timestamp;if(now<Number(c.deadline))await jump(Number(c.deadline)-now);const p=await dao.proposalCount();await dao.connect(a).propose(id,0);await dao.connect(a).vote(p,true);await jump(4201);await dao.execute(p);}
 it('Le projet A ne donne aucun vote ni proposition sur B ; quorum propre au projet',async()=>{
  const A=await create(),B=await create();await fund(A,a,'20');await fund(B,b,'1');await dao.connect(b).propose(B,1);
  expect((await dao.proposals(0)).quorum).to.equal(E('200'));
  await expect(dao.connect(a).vote(0,true)).to.be.revertedWith('no snapshot votes');
  await expect(dao.connect(a).propose(B,1)).to.be.revertedWith('insufficient proposer votes');
 });
 it('Après versement, les CFD sont conservés mais ne donnent aucun droit sur un autre projet',async()=>{
  const A=await create();await fund(A);await release(A);await core.connect(beneficiary).withdrawFunds(A);expect(await token.balanceOf(a)).to.equal(E('1000'));
  const B=await create();await fund(B,b);await expect(dao.connect(a).propose(B,1)).to.be.revertedWith('insufficient proposer votes');
  await expect(dao.connect(a).propose(A,1)).to.be.revertedWith('campaign closed');
 });
 it('Sans décision DAO : secours à la limite exacte et remboursement pendant la pause',async()=>{
  const id=await create();await fund(id);const end=await core.withdrawalDeadline(id);await core.pause();await at(end-1n);
  await expect(core.connect(a).refund(id)).to.be.revertedWith('not refundable');await at(end);
  await expect(core.connect(a).refund(id)).to.changeEtherBalances([core,a],[-E('1'),E('1')]);
  expect(await core.status(id)).to.equal(4);expect(await core.totalEscrow()).to.equal(0);
 });
 it('Objectif non atteint : remboursement immédiatement après collecte, même en pause',async()=>{
  const id=await create('2');await fund(id);await core.pause();await jump(3601);await core.connect(a).refund(id);expect(await core.totalEscrow()).to.equal(0);
 });
 it('Accord DAO et signatures ne permettent jamais le retrait à partir de la limite',async()=>{
  const id=await create('2');await fund(id,a,'2');await release(id);
  for(const s of [s1,s2])await guard.connect(s).setApproval(core.target,id,beneficiary.address,E('2'),true);
  await at(await core.withdrawalDeadline(id));await expect(core.connect(beneficiary).withdrawFunds(id)).to.be.revertedWith('settlement expired');
  await core.connect(a).refund(id);expect(await core.totalEscrow()).to.equal(0);
 });
 it('Retrait juste avant limite : aucun remboursement après le versement',async()=>{
  const id=await create();await fund(id);await release(id);await at((await core.withdrawalDeadline(id))-1n);
  await core.connect(beneficiary).withdrawFunds(id);await jump(2);await expect(core.connect(a).refund(id)).to.be.revertedWith('not refundable');
 });
 it('Un ancien vote ne peut être exécuté après le délai de secours',async()=>{
  const id=await create();await fund(id);await jump(3601);await dao.connect(a).propose(id,0);await dao.connect(a).vote(0,true);
  await at(await core.withdrawalDeadline(id));await expect(dao.execute(0)).to.be.revertedWith('campaign closed');expect((await dao.proposals(0)).executed).to.equal(false);
 });
 it('Refus de nouvelles propositions trop tard pour terminer avant le secours',async()=>{
  const id=await create();await fund(id);await at((await core.withdrawalDeadline(id))-4200n);
  await expect(dao.connect(a).propose(id,0)).to.be.revertedWith('insufficient settlement time');
 });
 it('Snapshot local immuable ; les remboursements actualisent les poids futurs',async()=>{
  const id=await create('10');await fund(id);const block=await ethers.provider.getBlockNumber();await jump(1);await fund(id,a,'2');
  expect(await core.getPastCampaignVotes(id,a.address,block)).to.equal(E('1000'));
  await jump(3601);await core.connect(a).refund(id);const refunded=await ethers.provider.getBlockNumber();await jump(1);
  expect(await core.getPastCampaignVotes(id,a.address,refunded)).to.equal(0);expect(await core.getPastCampaignSupply(id,refunded)).to.equal(0);
  await expect(core.getPastCampaignVotes(id,a.address,999999)).to.be.revertedWith('future snapshot');
 });
 it('Rotation : accès, adresses, deux signataires distincts et délai de 48 h',async()=>{
  await expect(guard.proposeReplacement(0,next.address)).to.be.revertedWith('not signer');
  for(const [slot,address] of [[3,next.address],[0,ethers.ZeroAddress],[0,s2.address]])await expect(guard.connect(s1).proposeReplacement(slot,address)).to.be.revertedWith('invalid replacement');
  await guard.connect(s1).proposeReplacement(0,next.address);
  await expect(guard.connect(s1).approveReplacement(0,true)).to.be.revertedWith('unchanged');
  await expect(guard.executeReplacement(0)).to.be.revertedWith('replacement not ready');
  await guard.connect(s2).approveReplacement(0,true);const r=await guard.replacements(0);
  await at(r.executableAt-1n);await expect(guard.executeReplacement(0)).to.be.revertedWith('replacement not ready');
  await at(r.executableAt);await guard.executeReplacement(0);
  expect(await guard.signers(0)).to.equal(next.address);expect(await guard.isSigner(s1)).to.equal(false);expect(await guard.signerEpoch()).to.equal(1);
  await expect(guard.connect(s1).setApproval(core.target,0,beneficiary.address,1,true)).to.be.revertedWith('not signer');
 });
 it('Révocation de rotation sous 2 accords : délai réinitialisé',async()=>{
  await guard.connect(s1).proposeReplacement(1,next.address);await guard.connect(s2).approveReplacement(0,true);const first=(await guard.replacements(0)).executableAt;
  await guard.connect(s2).approveReplacement(0,false);expect((await guard.replacements(0)).executableAt).to.equal(0);
  await jump(172801);await expect(guard.executeReplacement(0)).to.be.revertedWith('replacement not ready');
  await guard.connect(s3).approveReplacement(0,true);expect((await guard.replacements(0)).executableAt).to.be.greaterThan(first);
 });
 it('Rotation invalide toutes les anciennes signatures et propositions ; nouvelle signature requise',async()=>{
  const id=await create('2');await fund(id,a,'2');await release(id);
  for(const s of [s1,s2])await guard.connect(s).setApproval(core.target,id,beneficiary.address,E('2'),true);
  const oldKey=await guard.withdrawalKey(core.target,id,beneficiary.address,E('2'));
  await guard.connect(s1).proposeReplacement(0,next.address);await guard.connect(s2).approveReplacement(0,true);
  await guard.connect(s3).proposeReplacement(1,a.address);await jump(172801);await guard.executeReplacement(0);
  expect(await guard.withdrawalKey(core.target,id,beneficiary.address,E('2'))).not.to.equal(oldKey);
  await expect(guard.connect(s2).approveReplacement(1,true)).to.be.revertedWith('stale replacement');
  await expect(core.connect(beneficiary).withdrawFunds(id)).to.be.revertedWith('multisig required');
  for(const s of [next,s2])await guard.connect(s).setApproval(core.target,id,beneficiary.address,E('2'),true);
  await core.connect(beneficiary).withdrawFunds(id);
 });
 it('Deux signataires indisponibles : restitution après délai malgré accord DAO',async()=>{
  const id=await create('2');await fund(id,a,'2');await release(id);
  await guard.connect(s1).setApproval(core.target,id,beneficiary.address,E('2'),true);
  await at(await core.withdrawalDeadline(id));await core.pause();await core.connect(a).refund(id);expect(await core.totalEscrow()).to.equal(0);
 });
 it('Points 7 et 9 conservés : propositions simultanées et cumul de rôles autorisés',async()=>{
  const id=await core.campaignCount();await core.createCampaign(E('1'),3600,s1.address,CID);await fund(id,s1,'1');
  await dao.connect(s1).propose(id,1);await dao.connect(s1).propose(id,1);expect(await dao.proposalCount()).to.equal(2);
  await dao.connect(s1).vote(0,true);await guard.connect(s1).setApproval(core.target,id,s1.address,E('1'),true);
 });
});
