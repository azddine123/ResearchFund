const {ethers,network,artifacts}=require('hardhat');
const fs=require('fs');
async function main(){
 const [deployer,...accounts]=await ethers.getSigners();const local=['localhost','hardhat'].includes(network.name);
 const admin=process.env.ADMIN_ADDRESS || (local?deployer.address:null);
 const signers=process.env.GUARD_SIGNERS?.split(',').map(x=>x.trim()) || (local?accounts.slice(3,6).map(x=>x.address):[]);
 if(!admin || signers.length!==3 || new Set(signers.map(x=>x.toLowerCase())).size!==3)throw Error('ADMIN_ADDRESS et trois GUARD_SIGNERS distincts requis');
 const guard=await (await ethers.getContractFactory('TreasuryGuard')).deploy(signers);await guard.waitForDeployment();
 const core=await (await ethers.getContractFactory('CrowdfundingCore')).deploy(deployer.address,guard.target);await core.waitForDeployment();
 const dao=await (await ethers.getContractFactory('FundingDAO')).deploy(core.target,local?3600:172800,local?600:21600);await dao.waitForDeployment();
 await (await core.configureGovernance(dao.target)).wait();
 if(admin.toLowerCase()!==deployer.address.toLowerCase()){
  await(await core.grantRole(await core.ADMIN_ROLE(),admin)).wait();await(await core.grantRole(await core.DEFAULT_ADMIN_ROLE(),admin)).wait();
  await(await core.renounceRole(await core.ADMIN_ROLE(),deployer.address)).wait();await(await core.renounceRole(await core.DEFAULT_ADMIN_ROLE(),deployer.address)).wait();
 }
 const token=await core.token();const receipt=await core.deploymentTransaction().wait();
 const config={rulesVersion:2,name:'ResearchFund',chainId:Number((await ethers.provider.getNetwork()).chainId),network:network.name,readRpc:local?'http://127.0.0.1:8545':'',deployedAtBlock:receipt.blockNumber,admin,signers,addresses:{core:core.target,token,dao:dao.target,guard:guard.target},abis:{}};
 for(const [key,name] of Object.entries({core:'CrowdfundingCore',token:'CFDToken',dao:'FundingDAO',guard:'TreasuryGuard'}))config.abis[key]=(await artifacts.readArtifact(name)).abi;
 fs.mkdirSync('frontend/public',{recursive:true});fs.mkdirSync('deployments',{recursive:true});
 fs.writeFileSync(`deployments/${network.name}.json`,JSON.stringify(config,null,2));fs.writeFileSync('frontend/public/config.json',JSON.stringify(config,null,2));
 console.log(JSON.stringify({...config,abis:undefined},null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1});
