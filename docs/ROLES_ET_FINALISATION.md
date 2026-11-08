# Rôles ResearchFund V2

| Rôle | Interface et droits |
| --- | --- |
| Visiteur | Consultation publique |
| Membre | Création de projet et contribution hors pause |
| Contributeur | Vote seulement sur ses projets, proposition à partir de 1 voix locale au snapshot, remboursement si éligible même en pause |
| Bénéficiaire | Retrait après objectif, fin de collecte, DAO, signatures si > 1 ETH, avant limite de versement |
| Administrateur | Pause et reprise ; ne peut empêcher les remboursements ouverts |
| Gestionnaire des rôles | Attribution/révocation du rôle administrateur opérationnel |
| Signataire | Approbation/révocation des retraits ; proposition et approbation de remplacement |

Les rôles sont lus sur la blockchain et affichés dans Mon espace. Ils sont cumulables : le point 9 n’est pas modifié. Les trois signataires actuels sont lus dans TreasuryGuard, et non dans la liste initiale du fichier de configuration. Après une rotation, les menus reflètent les nouveaux droits lors de l’actualisation.

Le bandeau CFD affiche la participation globale ; le poids d’un vote est affiché dans la proposition et dépend uniquement du projet concerné. Les comptes Hardhat initiaux et la procédure de démarrage figurent dans DEMARRAGE_RAPIDE.md. Les règles de délais, rotation et migration sont dans REGLES_V2.md.
