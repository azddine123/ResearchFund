# Démarrage rapide ResearchFund V2

Nouveau déploiement requis : les règles V2 ne peuvent pas être ajoutées aux contrats V1 déjà déployés. Conserver l’ancienne installation séparément si elle doit être utilisée.

1. Extraire l’archive ; ouvrir un terminal dans ResearchFund ; `npm ci`.
2. Terminal 1 : `npm run node`.
3. Terminal 2 : `npm run ipfs`.
4. Terminal 3 : `npm run deploy:local`, puis `npm run demo`, puis `npm run analyze`.
5. Terminal 4 : `npm run frontend`. Ouvrir http://127.0.0.1:5173.
6. MetaMask : RPC http://127.0.0.1:8545, chaîne 31337. Importer et connecter les comptes de test Hardhat.

Comptes par défaut (indices à partir de 0) : #0 admin ; #1 Alice ; #2 Bob ; #3 bénéficiaire ; #4, #5, #6 signataires. Ne jamais employer ces comptes publics de développement pour des fonds réels.

La démo crée 4 projets. Le premier termine sa collecte puis reçoit un vote et deux signatures avant versement. Le quatrième est annulé et partiellement remboursé. Le deuxième conserve une proposition d’annulation ouverte. Les tests automatisés ajoutent leurs propres projets et avancent l’horloge de la chaîne ; ils se lancent sur une chaîne de test séparée et jetable.

Pour tester le secours manuellement, consulter la date limite de versement affichée sur le projet. Après expiration sans versement, connecter le donateur et utiliser Récupérer. Pour tester la rotation : Espace signataire → Remplacer un signataire → deuxième accord → attendre 48 heures de chaîne → Exécuter. Après remplacement, réapprouver les retraits avec la nouvelle composition.

Lire REGLES_V2.md pour les détails. Les documents historiques V1 ne décrivent pas les règles courantes.
