// V14.2 (retour de Jack : « plus de phrases variées ») — nouvelles réponses des alliés aux demandes d'aide, autant que
// les anciennes pour chaque liste (le nombre de variantes double). {to} = demandeur, {x} = nation visée, {p} = province.
// Clé = chemin dans HELP_LINES (alliances.js) : « heros.defend.yes », « allyOfTarget »…
export const MORE_HELP_LINES = Object.freeze({
  "heros.defend.yes": [
    "Vous n’êtes pas seul, {to}. Nos lances se dressent entre {p} et ses ennemis.",
    "{to}, l’honneur l’exige : nous accourons défendre {p}.",
    "Tenez bon, {to} ! Nos chevaliers se mettent en selle.",
    "Notre parole vaut un rempart, {to}. Nous protégerons {p}.",
    "{to}, que {x} sache que nous sommes à vos côtés !",
    "Nous répondons à votre appel, {to}. Les opprimés ne sont jamais abandonnés.",
    "Notre foi d’allié est entière, {to}. Nos étendards couvriront {p}.",
    "{to}, aucune injustice ne passera tant que nos épées tiendront.",
    "Nos gardes se mettent en marche, {to}. Résistez jusqu’à leur arrivée !"
  ],
  "heros.defend.no": [
    "{to}, notre cœur est avec vous, mais nos armées ne peuvent vous rejoindre.",
    "Nous sommes navrés, {to} : nos chevaliers sont retenus loin de vos terres.",
    "{to}, nous aurions voulu répondre présent. Les circonstances nous l’interdisent.",
    "Que l’honneur nous pardonne, {to} : nous ne pouvons vous secourir.",
    "{to}, nos troupes sont blessées et trop lointaines. Courage, ami.",
    "Ce refus nous pèse, {to}. Nos frontières exigent notre présence."
  ],
  "heros.attack.yes": [
    "Si la cause est juste, {to}, nos épées sont à vous contre {x}.",
    "{to}, {x} a fauté. Nous serons l’instrument de la justice.",
    "Nous vous suivrons contre {x}, {to}. Que le droit triomphe !",
    "{to}, nos bannières marcheront aux vôtres contre {x}.",
    "Puisque {x} menace les faibles, {to}, nous le combattrons.",
    "{to}, nous avons juré de protéger les justes. {x} ne l’est pas.",
    "Notre lame ne se lève que pour le droit, {to}. Contre {x}, elle se lèvera.",
    "Marchons ensemble, {to}. {x} répondra de ses torts.",
    "{to}, vos raisons sont les nôtres. Nos armées attaqueront {x}."
  ],
  "heros.attack.no": [
    "{to}, nous ne frapperons pas {x} sans offense. L’honneur nous le défend.",
    "Chercher querelle à {x} serait indigne, {to}. Nous refusons.",
    "{to}, nous protégeons les innocents, nous ne les attaquons pas. Pas {x}.",
    "Notre serment est de défendre, {to}. Attaquer {x} le trahirait.",
    "{to}, {x} ne nous a donné aucun motif de guerre. Nous restons en retrait.",
    "Nous ne prêterons pas notre épée à une agression, {to}.",
    "{to}, prouvez-nous la faute de {x} et nous reconsidérerons.",
    "Un héros ne frappe pas sans raison, {to}. Nous déclinons."
  ],
  "conquerant.defend.yes": [
    "Un combat à mener, {to} ? Voilà qui nous réveille !",
    "{to}, nous viendrons briser {x}. Gardez-nous quelques ennemis.",
    "Nos lames s’impatientaient, {to}. Nous défendrons {p} avec fracas.",
    "Allons, {to}, ne tremblez pas. Nos légions écraseront {x}.",
    "Nous accourons, {to}. Que la gloire de la victoire nous revienne.",
    "{to}, {p} sera tenue. Et gare à ceux qui s’y frottent !",
    "Voilà une guerre qui nous plaît, {to}. Nos légions se mettent en marche."
  ],
  "conquerant.defend.no": [
    "{to}, nous ne sommes pas votre rempart. Débrouillez-vous.",
    "Non, {to}. Nos épées servent notre gloire, pas votre confort.",
    "{to}, la faiblesse ne mérite pas nos armées. Réagissez seuls.",
    "Votre querelle ne nous intéresse pas, {to}. Nous avons des terres à prendre.",
    "Nous passons notre chemin, {to}. Qui perd ses frontières l’a bien cherché.",
    "{to}, nos légions ne répondent pas à vos caprices."
  ],
  "conquerant.attack.yes": [
    "Enfin du mouvement, {to} ! {x} va goûter à nos lames.",
    "{to}, nous avions déjà envie de plier {x}. Allons-y !",
    "Sonnez les trompettes, {to} : nous marchons sur {x}.",
    "{x} fera un beau trophée, {to}. Nos légions s’ébranlent.",
    "Avec vous, {to}, la conquête sera plus rapide. {x} n’y survivra pas.",
    "Notre soif de combat est grande, {to}. {x} l’étanchera.",
    "{to}, vous avez bon goût. Écrasons {x} sans attendre."
  ],
  "conquerant.attack.no": [
    "{to}, nous n’attaquerons {x} que lorsque nous le voudrons.",
    "Vous espérez nous commander, {to} ? Voilà qui est amusant.",
    "Notre ambition ne passe pas par {x}, {to}. Cherchez ailleurs.",
    "{to}, nous guerroyons à notre manière, jamais à celle des autres.",
    "Pas question de servir vos plans, {to}. Nos armées suivent leur propre chemin.",
    "{to}, {x} ne vaut pas que nous bougions. Nous avons mieux en vue."
  ],
  "batisseur.defend.yes": [
    "{to}, nous poserons nos soldats comme des pierres sur vos murs.",
    "Nous viendrons à votre secours, {to}. Un voisin en péril, c’est une maison qui brûle.",
    "{to}, nos bras tiennent la pioche, mais aussi l’épée. Nous gardons {p}.",
    "Nos ouvriers déposent leurs outils, {to}. Nos gardes marchent vers {p}.",
    "Nous renforcerons vos murailles, {to}. {x} ne les franchira pas.",
    "{to}, ce qui est solide se défend ensemble. Nous arrivons.",
    "Un rempart ne tient que s’il est entouré d’amis, {to}. Nous voici."
  ],
  "batisseur.defend.no": [
    "{to}, nos chantiers sont sans défense si nos troupes partent. Pardonnez-nous.",
    "Nous voudrions vous aider, {to}, mais nos murs inachevés nous retiennent.",
    "{to}, nos soldats sont mobilisés sur nos fortifications. Excusez-nous.",
    "Hélas, {to}, nos gardes ne peuvent quitter nos cités en construction.",
    "{to}, nos moyens sont modestes et nos frontières exposées. Nous restons.",
    "Nous prions pour vos murailles, {to}, mais nos armées ne bougeront pas."
  ],
  "batisseur.attack.yes": [
    "{to}, la guerre nous répugne. Nous vous suivrons pourtant contre {x}.",
    "Si vous jugez cette attaque nécessaire, {to}, nous tiendrons notre place contre {x}.",
    "Nous préférerions bâtir, {to}. Mais contre {x}, nous viendrons.",
    "{to}, cette campagne contre {x} nous coûte. Nous la mènerons à vos côtés.",
    "Par loyauté, {to}, nous lèverons nos armes contre {x}. Sans enthousiasme.",
    "{to}, nous suivrons, la mort dans l’âme. Que {x} cède vite !"
  ],
  "batisseur.attack.no": [
    "{to}, nous construisons, nous ne détruisons pas. {x} peut dormir tranquille.",
    "Nos pierres ne servent pas à bâtir des guerres, {to}. Nous déclinons.",
    "{to}, attaquer {x} ruinerait nos efforts. Nous refusons poliment.",
    "Nous aimons trop nos chantiers pour les abandonner, {to}. Sans nous.",
    "{to}, la guerre contre {x} n’est pas la nôtre. Nous la laissons de côté.",
    "Veuillez comprendre, {to} : nos mains sont faites pour la truelle, pas pour l’assaut."
  ],
  "traitre.defend.yes": [
    "Évidemment, {to} ! Nos armées volent déjà à votre secours.",
    "{to}, comment pourrions-nous vous laisser seuls ? Nous partons !",
    "Quel honneur de vous protéger, {to}. {p} ne craint plus rien.",
    "Reposez-vous sur nous, {to}. Nos épées sont déjà tirées.",
    "Cher {to}, nous sommes votre bouclier le plus fidèle. Nous arrivons !",
    "Plus un mot, {to} : nos troupes sont sur la route.",
    "Vous avez notre parole la plus sincère, {to}. Rien ne vous arrivera."
  ],
  "traitre.defend.no": [
    "{to}, nous en sommes brisés, mais les circonstances nous retiennent.",
    "Oh, {to}, si vous saviez comme nous voudrions venir…",
    "Quelle tristesse, {to} ! Nos généraux jugent cela impossible.",
    "{to}, nous sommes de tout cœur avec vous. Hélas, pas autrement.",
    "Croyez-le, {to}, ce refus nous déchire. Nous reviendrons vers vous.",
    "{to}, tous nos regrets. Une autre fois, assurément."
  ],
  "traitre.attack.yes": [
    "Quelle excellente idée, {to} ! {x} ne s’y attend pas du tout.",
    "{to}, vous pouvez compter sur nous. {x} va tomber.",
    "Avec le plus grand plaisir, {to} ! Nous écraserons {x} ensemble.",
    "{to}, vos ennemis sont les nôtres. {x} est déjà perdu.",
    "Un mot de vous, {to}, et nous voilà contre {x}. Fiez-vous à nous !",
    "Rien ne nous ferait plus plaisir, {to}. Nos armées partent sur {x}.",
    "Nous serons fidèles au rendez-vous, {to}. Cher allié, jamais nous ne vous trahirions."
  ],
  "traitre.attack.no": [
    "{to}, quel dommage ! Le moment est vraiment mal choisi.",
    "Croyez que nous en souffrons, {to}. Nous ne pouvons pas, hélas.",
    "{to}, nous soutenons votre idée de tout cœur. Mais pas maintenant.",
    "Ah, {to}, attaquer {x} nous aurait tant plu… Une prochaine fois.",
    "{to}, nos soldats ne sont pas prêts. Pardonnez cette faiblesse.",
    "Vous méritez mieux que cela, {to}. Malheureusement, nous devons refuser."
  ],
  "allyOfTarget": [
    "{to}, {x} est notre allié aussi. Nous ne lui ferons pas de mal.",
    "Nous ne pouvons pas combattre {x}, {to} : un pacte nous lie à lui.",
    "{to}, {x} compte parmi nos amis. Nous ne choisirons pas votre camp contre lui.",
    "Frapper {x} reviendrait à briser notre parole, {to}. Nous refusons.",
    "{to}, une alliance nous unit à {x}. Elle nous interdit cette guerre.",
    "Vous et {x} êtes tous deux nos alliés, {to}. Nous ne trancherons pas par l’épée."
  ],
  "outOfReach": [
    "{to}, {x} se trouve hors de notre portée. Nos armées n’y ont aucun accès.",
    "Nous ne pouvons atteindre {x}, {to} : nul chemin, ni par terre ni par mer.",
    "{x} est trop loin pour nous, {to}. C’est hors de notre portée.",
    "{to}, sans frontière ni route maritime, {x} reste hors de notre portée.",
    "Hélas, {to}, {x} échappe à notre portée. Nos troupes ne peuvent s’y rendre.",
    "{to}, {x} demeure hors de notre portée. Choisissez une cible plus proche."
  ]
});
