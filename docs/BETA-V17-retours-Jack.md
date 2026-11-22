# Bêta V17 (temps réel) — retours de Jack

Fichier vivant : chaque retour de Jack est ajouté ici **dès qu'il arrive**, puis coché quand il est corrigé
(version + Pull Request). Ce fichier est la mémoire entre les conversations : ne jamais garder un retour
seulement dans une conversation ou dans un fichier local.

Version testée : `v17.10.1+947c86f` (APK de bêta, téléphone Xiaomi, paysage).

## Note du 22/11/2026
Un premier fichier de retours, créé dans une autre conversation, n'a jamais été poussé sur GitHub : il est perdu.
Les phrases de Jack de cette conversation-là sont à lui redemander ; elles seront recopiées ici mot pour mot.

## Retours reçus le 22/11/2026 (captures d'écran, 8 h 22 – 8 h 30)
Constatés sur les 4 captures envoyées avec le retour bêta :

- [ ] R1 — Diplomatie : Oroël écrit « La tension entre nous atteint 10 % » alors que la fenêtre de réponse
      affiche « TENSION 30 % (TENDU) ». Les deux chiffres doivent être les mêmes (ou le message doit dire
      clairement de quel moment il parle).
- [ ] R2 — Bandeau d'annonces tronqué : « En pause — touchez ▶ pour faire avancer le… »,
      « Roc-Épine → vous : « Vous avez toute ma… » ». Le texte doit être lisible en entier (2 lignes, défilement
      ou toucher pour lire).
- [ ] R3 — Vivres affichés avec une décimale (« 922,5 ») : afficher un nombre entier.
- [ ] R4 — Les grands noms de nations (OROËL, VALMORNE, SOLMARA…) passent sous / sur les boutons (roue des
      réglages, drapeaux, étoiles de capitale, effectifs « 218 ») et les masquent. Boutons, drapeaux et chiffres
      doivent toujours rester lisibles au-dessus des noms.

## Retours écrits de Jack (à recopier mot pour mot)

### 22/11/2026 — 8 h 36
> Petite incohérence dans le message que je reçois. Le conquérant me parle lui-même de la tension, mais surtout des
> pourcentages de tension. À la limite qu'ils me disent que nos deux pays commencent à être tendus, alors qu'en réalité
> 10% c'est encore très faible, mais dans l'idée pourquoi pas. En revanche qu'ils me parlent de pourcentage, c'est assez
> incohérent. Dans la vraie vie, le président de la France ne va pas aller voir le président italien pour lui dire
> « Nos tensions sont de 45%, tu vois ? » Ensuite, il y a un espèce de drapeau sur ma nation, je ne sais pas ce que c'est.
> Ensuite, il faut réellement pouvoir dézoomer, parce que là, on est trop zoomé, il y a trop d'informations d'un coup.
> C'est compliqué d'arriver à trier et donc à jouer. Ça fait mal au cerveau, ça fait mal aux yeux, c'est pas précis.
> Autre élément super important, n'oublie pas la distance entre l'île mystérieuse et les autres nations, de préférence
> égale. Pour le schéma des traits en pointillés qui désignent les lignes maritimes, en soi c'est pas compliqué. Chaque
> nation est reliée par un trait direct, qui ne tourne pas, qui est droit, qui est direct, à une autre nation, et chaque
> nation possède deux ports, qui sont reliés les uns aux autres dans une forme de grand cercle, comme ça. Au milieu, il y
> a l'île mystérieuse, beaucoup plus petite. Chaque port est relié à cette île mystérieuse. En ligne droite, pareil, pas
> de virage.

Traduit en tâches :
- [ ] R1 (remplacé) — Les dirigeants ne citent **jamais** de pourcentage de tension dans leurs messages : des mots
      (« nos relations se tendent », « la tension monte entre nous »…), adaptés au niveau réel (10 % = encore faible :
      pas de « tension » dramatique). Les pourcentages restent seulement dans l'interface (en-tête, conséquences).
- [ ] R5 — Drapeau sur la nation du joueur incompris : c'est l'emblème posé sur la capitale. Le rendre compréhensible
      (fiche/aide au toucher, ou le retirer si l'étoile de capitale suffit).
- [ ] R6 — Pouvoir vraiment dézoomer : voir tout le monde d'un coup, moins d'informations à la fois, plus lisible et précis.
- [ ] R7 — Routes maritimes : traits droits, sans virage. Chaque nation a 2 ports ; les ports relient les nations voisines
      en un grand cercle ; l'île mystérieuse, beaucoup plus petite, est au centre et chaque port y est relié en ligne
      droite. Distance (durée de trajet) île mystérieuse ↔ chaque nation : égale.
