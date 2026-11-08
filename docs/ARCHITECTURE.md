> Document historique V1. Les règles applicables à la livraison V2 sont décrites dans [REGLES_V2.md](REGLES_V2.md). Les affirmations ci-dessous sur la gouvernance globale, le déblocage anticipé, les signataires fixes ou la pause des remboursements sont obsolètes.

# Architecture et invariants

```mermaid
flowchart TD
 U[Utilisateur] --> UI[Interface Ethers.js]
 UI --> W[MetaMask]
 UI --> IPFS[Métadonnées IPFS]
 W --> C[CrowdfundingCore]
 W --> D[FundingDAO]
 W --> G[TreasuryGuard 2 sur 3]
 C --> T[CFDToken]
 D --> T
 D --> C
 C --> G
 C --> E[Événements publics]
 E --> P[Analyse Python]
 P --> UI
```

La clé privée reste dans le wallet. L’interface est remplaçable ; un appel direct aux contrats subit exactement les mêmes contrôles.

| Invariant | Mise en œuvre | Preuve |
|---|---|---|
| Une contribution positive crée exactement 1 000 unités CFD par unité wei | Core.contribute et token.mint réservé à Core | test M1, fuzzing |
| Les obligations financières restent couvertes | totalEscrow = somme des séquestres ; aucun retrait Admin | fuzzing, test multi-campagnes |
| Un retrait payé ne peut pas être payé deux fois | withdrawn avant appel externe + nonReentrant | tests retrait et réentrance |
| Un remboursement ne laisse pas de jetons correspondants | burn atomique avant transfert | tests remboursement et refus ETH |
| Un vote ne change pas de poids après création | ERC20Votes au bloc snapshot | tests après proposition et même bloc |
| Une majorité sans quorum ne suffit pas | oui+non ≥ quorum, oui > non | tests quorum et égalité |
| Un gros retrait exige deux personnes cryptographiques | deux adresses distinctes pour la même clé d’opération | tests multisig |

Sous transactions normales : `balance(Core) == totalEscrow`. En présence d’ETH forcé : `balance(Core) >= totalEscrow`. Une égalité absolue ne peut pas être garantie contre un transfert forcé ; ces fonds ne sont pas distribués arbitrairement.

## États
- En cours : avant deadline, ni annulation ni autorisation de sortie.
- Réussie : objectif atteint à échéance OU autorisation anticipée de la DAO.
- Échouée : après échéance et objectif non atteint, sans autorisation anticipée.
- Annulée : gel/annulation voté, avant retrait ; contributions remboursables.

`releaseApproved` et `withdrawn` sont distincts : « Réussie » ne signifie pas « fonds déjà payés ». Un vote d’annulation exécuté avant le retrait rend l’autorisation antérieure inutilisable. Après un retrait, une annulation est impossible.

## Signatures et appels
Les transactions Ethereum portent la signature du wallet. TreasuryGuard comptabilise des transactions d’approbation provenant de trois adresses autorisées ; deux adresses distinctes sont nécessaires. Il n’y a pas de signatures hors chaîne ni de récupération `ecrecover` personnalisée. L’absence de rotation est une limite assumée.

## Adaptation ResearchFund
Les contrats, ABI et règles économiques restent identiques. Le serveur IPFS et le formulaire partagent `shared/research-metadata.mjs`. Les JSON scientifiques v2 sont stockés hors chaîne ; Core conserve le CID. Les anciens JSON sont normalisés avec des sections vides. Ethers lit les événements pour l’historique et le nombre d’adresses contributrices. Les documents sont uniquement des références CID ; aucun paiement par étape, aucun classement scientifique automatique.
