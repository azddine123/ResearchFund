> Document historique V1. Les règles applicables à la livraison V2 sont décrites dans [REGLES_V2.md](REGLES_V2.md). Les affirmations ci-dessous sur la gouvernance globale, le déblocage anticipé, les signataires fixes ou la pause des remboursements sont obsolètes.

# Validation ResearchFund — 6 novembre 2026

| Vérification exécutée | Résultat observé |
|---|---|
| npm ci | Réussi, 838 paquets installés ; avertissements de dépendances dépréciées |
| npm run compile | Réussi, 35 fichiers Solidity compilés, cible Paris |
| npm test | 26 tests blockchain réussis, y compris réentrance, snapshots, multisig et fuzzing déterministe |
| npm run test:python | 5 tests réussis |
| npm run test:metadata | 3 tests réussis : compatibilité, conservation des champs, rejets d’entrées |
| npm run build | Build Vite réussi |
| python3 scripts/validate-local.py | Terminé avec succès ; services séparés, déploiement, démo, IPFS, export, analyse, UI, build |
| Vérification IPFS | 4 JSON de démonstration relus, octets et SHA-256 conformes aux CID ; origine interdite et JSON invalide rejetés |
| UI Playwright | Filtres, fiche scientifique, preuves transactionnelles, DAO, alertes, mobile 390 px sans débordement ; aucune erreur JS non interceptée |
| Transactions UI | Fournisseur EIP-1193 injecté : contribution 0,001 ETH et création réelle d’un cinquième projet avec métadonnées IPFS |
| Démonstration | 4 campagnes fictives, 3 propositions, retrait multisig 1,8 ETH, remboursement 0,2 ETH ; 10 contributions avant test UI, 11 après |
| Contrats inchangés | Comparaison octet pour octet avec l’archive fournie, empreintes dans evidence/unchanged-contracts.json |
| Slither | Non exécuté : module Python absent ; ancien résultat archivé, non présenté comme nouvel audit |
| MetaMask réel / Sepolia | Non exécutés ; vérification manuelle restante |

Sorties brutes et captures de la nouvelle application : `docs/evidence/`. Les captures UI sont prises avec les quatre projets avant les transactions supplémentaires. Les adresses et ABI exportées sont à régénérer sur chaque nouvelle instance locale. Les processus de validation ont été arrêtés à la fin.

Un premier passage UI a bloqué car le scénario ne cochait pas le consentement obligatoire de création ; le test a été corrigé pour suivre le parcours requis, sans supprimer le contrôle. Le passage final réussit.

## Limites restantes
- Documents : références CID à des fichiers déjà stockés, pas de dépôt binaire ni d’inspection de leur contenu ; taille et format déclaratifs.
- IPFS local sans réplication P2P ; disponibilité publique non garantie.
- Pas de validation scientifique, de détection de plagiat ou de modèle IA entraîné. Les heuristiques conservées détectent répétitions, pics de fréquence et montants atypiques ; pas de règle dédiée à la concentration multi-adresses.
- Comptages dérivés limités aux campagnes/propositions chargées ; historique dépend du RPC. CFD conservés après un don réussi.
- Pas de paiement par tranche, de rotation des signataires ou de mise en production.
- Documentation de soutenance mise à jour en Markdown ; le rapport PDF et les anciennes preuves sont archivés, pas régénérés.
- Le cahier pédagogique original n’a pas été fourni avec cette demande : validation complète avec l’énoncé restant à faire.
