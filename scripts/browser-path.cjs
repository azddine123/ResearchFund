// Extraction sans changer les propriétaires (compatible conteneurs Linux).
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {pipeline}=require('node:stream/promises');const {createBrotliDecompress}=require('node:zlib');
module.exports=async function(){
 if(process.env.CHROMIUM_EXECUTABLE)return process.env.CHROMIUM_EXECUTABLE;
 const dir=path.join(os.tmpdir(),'researchfund-browser');fs.mkdirSync(dir,{recursive:true});
 const bin=path.join(path.dirname(require.resolve('@sparticuz/chromium')),'../bin');
 const executable=path.join(dir,'chromium');
 if(!fs.existsSync(executable)||fs.statSync(executable).size<100000000){
  await pipeline(fs.createReadStream(path.join(bin,'chromium.br')),createBrotliDecompress(),fs.createWriteStream(executable,{mode:0o700}));
 }
 if(!fs.existsSync(path.join(dir,'libGLESv2.so'))){
  await pipeline(fs.createReadStream(path.join(bin,'swiftshader.tar.br')),createBrotliDecompress(),require('tar-fs').extract(dir,{chown:false}));
 }
 process.env.FONTCONFIG_PATH='/etc/fonts';return executable;
};
