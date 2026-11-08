#!/usr/bin/env python3
"""Démo reproductible dans un même environnement réseau ; arrête les services en sortie."""
import subprocess,time,urllib.request,json,os
from pathlib import Path
root=Path(__file__).resolve().parents[1];os.chdir(root);processes=[];logs=[]
def start(cmd,log):
 f=open(log,'w');logs.append(f);p=subprocess.Popen(cmd,stdout=f,stderr=subprocess.STDOUT);processes.append(p)
def wait(url):
 for _ in range(90):
  try:
   if url.endswith('8545'):
    req=urllib.request.Request(url,json.dumps({'jsonrpc':'2.0','id':1,'method':'eth_chainId','params':[]}).encode(),{'Content-Type':'application/json'});urllib.request.urlopen(req,timeout=2).read()
   else:urllib.request.urlopen(url,timeout=2).read()
   return
  except Exception:time.sleep(.5)
 raise RuntimeError('Service indisponible : '+url)
def run(cmd,out=None):
 print('RUN',' '.join(cmd),flush=True)
 if out:
  with open(out,'w') as f:subprocess.run(cmd,check=True,stdout=f,stderr=subprocess.STDOUT)
 else:subprocess.run(cmd,check=True)
try:
 start(['node','node_modules/hardhat/internal/cli/cli.js','node'],'/tmp/research-validation-node.log')
 start(['node','scripts/ipfs-server.mjs'],'/tmp/research-validation-ipfs.log')
 start(['node','node_modules/vite/bin/vite.js','frontend','--host','127.0.0.1'],'/tmp/research-validation-vite.log')
 wait('http://127.0.0.1:8545');wait('http://127.0.0.1:8787/health');wait('http://127.0.0.1:5173')
 run(['npm','run','deploy:local'],'docs/evidence/deployment.txt')
 run(['npm','run','demo'],'docs/evidence/demo.txt')
 run(['node','scripts/check-ipfs.mjs'],'docs/evidence/ipfs-tests.txt')
 run(['npx','hardhat','run','scripts/export-events.js','--network','localhost'],'docs/evidence/export.txt')
 run(['python','scripts/analyze.py','docs/evidence/contributions.json'])
 run(['node','scripts/check-ui.cjs'])
 run(['node','scripts/check-roles.cjs'])
 run(['npx','hardhat','run','scripts/export-events.js','--network','localhost'],'docs/evidence/export.txt')
 run(['python','scripts/analyze.py','docs/evidence/contributions.json'])
 run(['npm','run','build'],'docs/evidence/build.txt')
 print('VALIDATION LOCALE TERMINÉE',flush=True)
finally:
 for p in processes:p.terminate()
 for p in processes:
  try:p.wait(timeout=5)
  except subprocess.TimeoutExpired:p.kill()
 for f in logs:f.close()
