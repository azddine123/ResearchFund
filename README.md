# ResearchFund V2 — financement scientifique par projet

Version du 7 novembre 2026. Implémentation des points **1 à 6** validés dans la discussion. Les points **7 (propositions concurrentes), 8 (jalons informatifs) et 9 (cumul de rôles)** conservent leur fonctionnement.

## Nouvelle installation locale

Node.js 22 ou 24, Python 3.10+. Depuis le dossier ResearchFund : `npm ci`.

Ouvrir quatre terminaux :

1. `npm run node` — nœud Hardhat local, port 8545.
2. `npm run ipfs` — service IPFS local, port 8787.
3. `npm run deploy:local`, puis `npm run demo`, puis `npm run analyze`.
4. `npm run frontend` — ouvrir http://127.0.0.1:5173.

MetaMask : réseau local, RPC http://127.0.0.1:8545, chainId 31337. Comptes Hardhat par défaut : #0 admin ; #1 Alice ; #2 Bob ; #3 bénéficiaire ; #4, #5 et #6 signataires (indices à partir de zéro). Importer les comptes de test depuis le terminal du nœud, puis connecter le compte choisi au site.

**Migration V1 → V2 : nouveau déploiement obligatoire.** Les contrats V1 ne sont pas modifiables ; la V2 ne transforme ni leurs fonds ni leurs campagnes. Conserver séparément l’ancienne installation si elle doit encore être utilisée. Ne pas recopier son config.json dans la V2. Le déploiement V2 génère les nouvelles adresses et ABI. Un redémarrage du nœud Hardhat efface son état de test : ne le faire que pour recommencer une démonstration jetable.

## Règles

- Chaque campagne possède ses votes et son quorum : 20 % des voix propres au projet au snapshot, majorité stricte, 1 ETH = 1 000 voix. Une contribution d’au moins 0,001 ETH au snapshot permet de proposer.
- Les CFD restent des jetons non transférables de participation. Après versement, ils sont conservés, mais ils ne donnent pas de voix sur d’autres projets. Lors d’un remboursement, les CFD correspondants sont brûlés.
- Déblocage uniquement après fin de collecte et objectif atteint. La DAO, puis les signatures si montant > 1 ETH, précèdent le retrait du bénéficiaire.
- Sans versement **14 jours après la fin de collecte**, le retrait et les décisions DAO deviennent impossibles ; les remboursements individuels deviennent accessibles, même après autorisation DAO. La pause ne les bloque pas.
- Remplacement d’un signataire : deux accords sur trois, puis **48 heures**. Une rotation invalide toutes les anciennes signatures et les autres remplacements en attente.
- Deux signataires indisponibles empêchent la rotation, mais pas les remboursements de secours.

Les délais utilisent l’horloge de la chaîne. Le passage d’une échéance ouvre un droit ; une transaction reste nécessaire pour voter, exécuter, signer, retirer ou réclamer un remboursement.

## Validation

```bash
npm test
npm run test:metadata
npm run test:python
npm run test:ui
npm run build
```

`test:ui` démarre une chaîne locale de test, déploie les contrats et crée des campagnes fictives. Il nécessite les ports 8545, 8787 et 5173 libres. Il ne doit pas être lancé contre une installation à conserver.

Tests de contrats : `test/AtlasFund.test.js` (régressions adaptées), `test/RulesV2.test.js` (nouveaux cas). Tests navigateur : `scripts/check-ui.cjs` et `scripts/check-roles.cjs` (transactions réelles sur Hardhat via fournisseur EIP-1193 de test). MetaMask réel reste à vérifier manuellement.

Documentation courante : [règles et migration](docs/REGLES_V2.md), [rôles](docs/ROLES_ET_FINALISATION.md), [démarrage rapide](docs/DEMARRAGE_RAPIDE.md). Les documents sous docs/history et les documents marqués V1 sont historiques. Les preuves actuelles sont identifiées dans docs/evidence/README_V2.md.

Prototype pédagogique local. Cette validation ciblée n’est pas un audit de production.
