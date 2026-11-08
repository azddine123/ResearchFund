# Règles V2 et limites du changement

## Périmètre demandé

Implémentation de 1 à 6 uniquement. Aucun verrou de proposition unique n’a été ajouté (7). Les étapes scientifiques restent déclaratives, sans paiement par tranches (8). Les règles ne restreignent pas le cumul bénéficiaire/donateur/signataire et n’excluent pas le bénéficiaire du vote (9).

| Point | Implémentation |
| --- | --- |
| 1 — Vote par projet | Checkpoints des contributions individuelles et du total de chaque campagne dans CrowdfundingCore. FundingDAO lit ces historiques au bloc précédent la proposition. Les voix d’un autre projet n’entrent ni dans le vote ni dans le quorum. |
| 2 — Influence des anciens donateurs | Les CFD globaux ne sont plus la source du vote. Les campagnes versées, annulées, échouées ou expirées ne sont plus gouvernables. Un historique reste lisible sans conférer de nouveaux droits. |
| 3 — Inaction ou absence de signatures | SETTLEMENT_PERIOD = 14 jours après deadline. À l’instant exact de l’expiration : retrait refusé, remboursement autorisé. Une autorisation DAO antérieure ne repousse pas cette limite. Aucun administrateur ne peut la prolonger. |
| 4 — Tout ou rien | Proposition de déblocage et autorisation exigent collecte terminée et objectif atteint. Échec sous objectif : remboursement dès la fin de collecte. |
| 5 — Rotation | Un signataire propose une nouvelle adresse et donne le premier accord. Deux accords déclenchent 48 heures. La révocation sous deux remet le délai à zéro. Après rotation, un nouvel identifiant de composition invalide toutes les anciennes signatures et rotations restantes. |
| 6 — Pause | La pause conserve son effet sur création/contribution/autorisation de déblocage/retrait. Le remboursement n’est plus suspendu. Le contrôle d’éligibilité, la protection anti-réentrance et l’impossibilité de double remboursement restent actifs. |

## Calendrier

`deadline` = fin de la collecte. `withdrawalDeadline` = deadline + 14 jours.

Avant deadline : contributions et propositions d’annulation possibles. Après deadline : si objectif atteint, vote de déblocage possible ; sinon remboursement immédiat. Dans les 14 jours suivants : vote, délai d’exécution, signatures et retrait doivent tous être terminés. Les nouvelles propositions sont refusées si leur vote et leur délai ne peuvent pas se terminer avant la limite.

À partir de withdrawalDeadline, tout projet non versé devient remboursable. Un versement déjà effectué reste définitif. Il n’y a aucun paiement automatique : chaque action nécessitant un transfert utilise une transaction.

Les paramètres DAO locaux sont 1 heure de vote et 10 minutes de délai d’exécution. Le déploiement non local conserve 2 jours et 6 heures. Le constructeur refuse des délais incompatibles avec la fenêtre de 14 jours. Les tests avancent le temps Hardhat ; les contrats ne contiennent pas de raccourci permettant de changer le temps.

## Vote et unités

La contribution propre au projet est multipliée par 1 000 pour garder des unités familières. Les valeurs sont à 18 décimales. Le quorum arrondi vers le haut est 20 % des voix locales au snapshot. Minimum de proposition : 1 voix (0,001 ETH). Tout poids strictement positif au snapshot peut voter. Majorité stricte pour > contre.

Le remboursement écrit aussi un checkpoint et brûle les CFD correspondants. Les snapshots passés restent immuables. Ils ne permettent pas de voter après clôture de la campagne. Les anciennes fonctions ERC20Votes du jeton restent consultables pour compatibilité, mais FundingDAO ne les utilise plus.

## Remplacement des signataires

Depuis Espace signataire, choisir l’une des trois positions et une nouvelle adresse. Zéro, adresse déjà signataire et position inexistante sont refusés. Deux signataires actuels distincts doivent approuver. Une troisième approbation ne redémarre pas le délai. Si une révocation fait passer sous deux accords, le délai est annulé ; un nouveau quorum déclenche 48 nouvelles heures.

Tout compte peut techniquement exécuter une rotation devenue exécutable. L’interface la présente aux signataires. L’ancien signataire perd immédiatement ses droits, le nouveau les obtient. Les retraits en attente exigent de nouvelles signatures de la nouvelle composition. Il n’existe pas de remplacement forcé par l’administrateur. Si deux signataires sont indisponibles, la restitution de secours protège les contributions non versées.

## Migration et données

Cette version modifie les contrats : nouveau déploiement et nouvelles ABI obligatoires. La configuration contient rulesVersion = 2. L’interface refuse une configuration V1 pour éviter de présenter des droits de remboursement inexistants sur un ancien contrat.

Aucune migration automatique des fonds, historiques ou votes V1. Conserver V1 à part si nécessaire. Les métadonnées IPFS restent réutilisables par leur CID si leur stockage est disponible. Ne pas écraser la configuration V2 par une ancienne configuration.

## Vérification et limites

Les tests couvrent isolation des voix et du quorum, snapshots, bornes temporelles exactes, retrait juste avant expiration, refus à expiration, restitution pendant pause, rotation, révocation, invalidation des signatures, nouvelles signatures, accès non autorisés et réentrance. Les tests navigateur couvrent les interfaces et les transactions sur une chaîne locale réelle avec un fournisseur EIP-1193 injecté. L’extension MetaMask réelle et un déploiement public ne sont pas validés ici.

Les points 7–9 sont explicitement inchangés. Un test confirme notamment que plusieurs propositions d’annulation et le cumul des rôles restent possibles.
