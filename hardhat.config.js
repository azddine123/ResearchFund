require('@nomicfoundation/hardhat-ethers');
require('@nomicfoundation/hardhat-chai-matchers');
const { subtask } = require('hardhat/config');
const { TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD } = require('hardhat/builtin-tasks/task-names');
// Version npm épinglée : compilation reproductible sans téléchargement de solc.
subtask(TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD).setAction(async ({ solcVersion }, hre, next) => {
 if (solcVersion === '0.8.28') return {compilerPath:require.resolve('solc/soljson.js'),isSolcJs:true,version:solcVersion,longVersion:require('solc').version()};
 return next();
});
module.exports = {
 solidity:{version:'0.8.28',settings:{optimizer:{enabled:true,runs:200},evmVersion:'paris'}},
 networks:{localhost:{url:'http://127.0.0.1:8545'},...(process.env.SEPOLIA_RPC_URL?{sepolia:{url:process.env.SEPOLIA_RPC_URL,accounts:process.env.DEPLOYER_PRIVATE_KEY?[process.env.DEPLOYER_PRIVATE_KEY]:[]}}:{})},
 mocha:{timeout:120000}
};
