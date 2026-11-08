const {ethers}=require('hardhat');const fs=require('fs');
async function main(){
 const config=JSON.parse(fs.readFileSync(process.env.CONFIG || 'deployments/localhost.json'));
 const core=new ethers.Contract(config.addresses.core,config.abis.core,ethers.provider);
 const tip=await ethers.provider.getBlockNumber();const rows=[];
 // Fenêtres bornées pour les fournisseurs RPC avec limites de eth_getLogs.
 for(let start=config.deployedAtBlock;start<=tip;start+=1000){
  const events=await core.queryFilter(core.filters.Contribution(),start,Math.min(start+999,tip));
  for(const e of events){const b=await e.getBlock();rows.push({campaign:Number(e.args.id),address:e.args.contributor,amount_wei:e.args.amount.toString(),timestamp:b.timestamp,block:e.blockNumber,tx:e.transactionHash});}
 }
 fs.mkdirSync('docs/evidence',{recursive:true});fs.writeFileSync('docs/evidence/contributions.json',JSON.stringify({chainId:config.chainId,core:core.target,fromBlock:config.deployedAtBlock,toBlock:tip,events:rows},null,2));
 console.log(`${rows.length} événements réels exportés jusqu’au bloc ${tip}.`);
}
main().catch(e=>{console.error(e);process.exitCode=1});
