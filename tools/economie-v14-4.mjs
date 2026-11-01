#!/usr/bin/env node
// FRONTIÈRES: ARKEN — simulation de rentabilité V14.4 (déterministe, sans réseau, sans hasard).
// Relancer :  node tools/economie-v14-4.mjs        (ou  --json  pour une sortie lisible par un programme)
//
// HYPOTHÈSES (ordres de grandeur prudents pour un petit jeu gratuit sans marque, public français ;
// aucune promesse de précision : les vraies valeurs se lisent dans AdMob et la Play Console après la sortie).
//
// Publicités (AdMob). eCPM = ce que rapportent 1 000 publicités AFFICHÉES, en euros, déjà net de la part d'AdMob.
//   - interstitiel (plein écran, début de partie) : France 1,5 / 3 / 5 € (bas / central / haut)
//   - récompensée (vidéo choisie par le joueur)   : France 4 / 8 / 14 €
//   - taux de remplissage (part des demandes qui reçoivent bien une pub) : 60 % / 80 % / 90 %
//   - consentement aux pubs personnalisées (RGPD) : 40 % / 55 % / 70 % ; sans consentement la pub vaut ~60 % de moins
//     (facteur 0,4 sur l'eCPM). Source d'ordre de grandeur : retours publics d'éditeurs de jeux mobiles, à vérifier.
// Joueurs (10 000 joueurs actifs par mois) :
//   - parties lancées par joueur et par mois : 1 / 2 / 3,5 (une partie = 80 tours = plusieurs jours, donc peu)
//   - jours de jeu par joueur et par mois : 4 / 8 / 14
//   - la mission « regarder une pub » est proposée 7 jours sur 10 ; part des joueurs qui la regardent : 25 % / 40 % / 60 %
// Achats :
//   - Pack débutant (sans pub + 3 jetons, achat unique) : 0,3 % / 0,8 % / 1,5 % des joueurs actifs par mois
//     (on compte les NOUVEAUX acheteurs du mois ; chaque joueur ne l'achète qu'une fois)
//   - jetons : 0,2 % / 0,6 % / 1,2 % des joueurs actifs achètent des jetons dans le mois
//     (panier moyen : 1,3 achat par acheteur, réparti entre lots de 1, 5 et 12 jetons)
//   - prix TTC proposés : voir PRIX ci-dessous
// Commission et taxes : Google garde 15 % (petit éditeur, premiers 1 M$ par an) ; la TVA française de 20 % est comprise
//   dans le prix affiché, donc net = prix / 1,2 x 0,85. Les revenus de pubs ne portent ni commission Google ni TVA ici.
// Coûts de fonctionnement : 0 € (jeu sans serveur, sauvegarde dans le téléphone). Frais fixes (compte Play Console)
//   déjà payés. Seul coût réel : le temps de Jack.
// Cotisations micro-entreprise : ordre de grandeur ~22 % du chiffre d'affaires (services, sans versement libératoire).

export const COUT_FONCTIONNEMENT_MENSUEL = 0;
export const JOUEURS = 10000;
export const COMMISSION_GOOGLE = 0.15;
export const TVA = 0.20;
export const COTISATIONS_APPROX = 0.22;
export const JETONS_POUR_TOUT_MAXIMISER = 50; // 5 atouts x 10 niveaux x 1 jeton
export const JETONS_GRATUITS_PAR_JOUR_MAX = 1; // 5 missions sur 5 = 1 jeton, soit ~7 semaines

/** Prix TTC recommandés en euros. */
export const PRIX = Object.freeze({ pack_debutant: 2.99, jetons_1: 0.49, jetons_5: 1.99, jetons_12: 3.99 });
const JETONS = { jetons_1: 1, jetons_5: 5, jetons_12: 12 };
/** Répartition des achats de jetons (part des achats) : beaucoup de petits paniers. */
const MIX_JETONS = { jetons_1: 0.2, jetons_5: 0.5, jetons_12: 0.3 };

export const SCENARIOS = Object.freeze({
  bas:     { ecpmInter: 1.5, ecpmRecomp: 4,  remplissage: 0.60, consentement: 0.40, parties: 1,   joursJeu: 4,  partRecomp: 0.25, convPack: 0.003, convJetons: 0.002 },
  central: { ecpmInter: 3,   ecpmRecomp: 8,  remplissage: 0.80, consentement: 0.55, parties: 2,   joursJeu: 8,  partRecomp: 0.40, convPack: 0.008, convJetons: 0.006 },
  haut:    { ecpmInter: 5,   ecpmRecomp: 14, remplissage: 0.90, consentement: 0.70, parties: 3.5, joursJeu: 14, partRecomp: 0.60, convPack: 0.015, convJetons: 0.012 }
});
const FACTEUR_SANS_CONSENTEMENT = 0.4;
const JOURS_AVEC_MISSION_PUB = 0.7;
const ACHATS_PAR_ACHETEUR_JETONS = 1.3;

/** Net encaissé par Jack pour un achat à `prixTtc` euros. */
export const netAchat = prixTtc => prixTtc / (1 + TVA) * (1 - COMMISSION_GOOGLE);

const valeurEcpm = (ecpm, s) => ecpm * (s.consentement + (1 - s.consentement) * FACTEUR_SANS_CONSENTEMENT);

/** Revenu net mensuel pour `joueurs` joueurs actifs, option `ajuste` = variante proposée (voir docs). */
export function simuler(s, joueurs = JOUEURS, { ajuste = false } = {}) {
  const acheteursPack = joueurs * s.convPack;
  const sansPub = joueurs - acheteursPack; // seuls ceux-là voient l'interstitiel
  const interstitiels = sansPub * s.parties * s.remplissage;
  const pubsInter = interstitiels / 1000 * valeurEcpm(s.ecpmInter, s);
  // pubs récompensées : facultatives, regardées même avec le Pack
  let vuesRecomp = joueurs * s.joursJeu * JOURS_AVEC_MISSION_PUB * s.partRecomp * s.remplissage;
  if (ajuste) vuesRecomp += joueurs * s.joursJeu * 0.5 * s.remplissage * s.partRecomp; // « bonus facultatif » : 0,5 vue de plus par jour de jeu chez les mêmes joueurs
  const pubsRecomp = vuesRecomp / 1000 * valeurEcpm(s.ecpmRecomp, s);
  const achatsPack = acheteursPack * netAchat(PRIX.pack_debutant);
  const acheteursJetons = joueurs * s.convJetons;
  const panierMoyen = Object.entries(MIX_JETONS).reduce((t, [id, p]) => t + p * PRIX[id], 0);
  const achatsJetons = acheteursJetons * ACHATS_PAR_ACHETEUR_JETONS * netAchat(panierMoyen);
  const achats = achatsPack + achatsJetons;
  const brut = pubsInter + pubsRecomp + achats;
  const net = brut - COUT_FONCTIONNEMENT_MENSUEL;
  return { joueurs, coutFonctionnement: COUT_FONCTIONNEMENT_MENSUEL, pubsInter, pubsRecomp, achatsPack, achatsJetons, achats, net, netParJoueur: net / joueurs, netApresCotisations: net * (1 - COTISATIONS_APPROX) };
}

/** Nombre de joueurs actifs/mois pour gagner `cible` euros nets par mois (avant cotisations). */
export const joueursPour = (s, cible) => Math.ceil(cible / simuler(s).netParJoueur);

/** Coût (euros TTC) pour acheter `n` jetons au meilleur prix avec les lots proposés. */
export function coutJetons(n) {
  const lots = [[12, PRIX.jetons_12], [5, PRIX.jetons_5], [1, PRIX.jetons_1]];
  const best = Array(n + 1).fill(Infinity); best[0] = 0;
  for (let i = 1; i <= n; i++) for (const [q, p] of lots) if (i - q >= -11) best[i] = Math.min(best[i], best[Math.max(0, i - q)] + p);
  return Math.round(best[n] * 100) / 100;
}

export function rapport() {
  const out = { scenarios: {}, ajuste: {}, objectifs: {}, seuil: {}, jetons: {} };
  for (const [nom, s] of Object.entries(SCENARIOS)) {
    out.scenarios[nom] = simuler(s);
    out.ajuste[nom] = simuler(s, JOUEURS, { ajuste: true });
    out.seuil[nom] = { joueurs: 1, netParJoueur: out.scenarios[nom].netParJoueur };
    out.objectifs[nom] = Object.fromEntries([100, 500, 1000].map(c => [c, joueursPour(s, c)]));
  }
  out.jetons = { pourToutMaximiser: JETONS_POUR_TOUT_MAXIMISER, cout: coutJetons(JETONS_POUR_TOUT_MAXIMISER), coutPackPlusReste: Math.round((PRIX.pack_debutant + coutJetons(JETONS_POUR_TOUT_MAXIMISER - 3)) * 100) / 100, semainesGratuites: 7 };
  return out;
}

const e = x => `${x.toFixed(x < 10 ? 2 : 0)} €`;
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  const r = rapport();
  if (process.argv.includes('--json')) console.log(JSON.stringify(r, null, 2));
  else {
    console.log(`ARKEN V14.4 — revenu net mensuel pour ${JOUEURS} joueurs actifs (coût de fonctionnement : ${COUT_FONCTIONNEMENT_MENSUEL} €)`);
    for (const n of Object.keys(SCENARIOS)) {
      const x = r.scenarios[n];
      console.log(`${n.padEnd(8)} pubs début ${e(x.pubsInter)} | pubs récompensées ${e(x.pubsRecomp)} | achats ${e(x.achats)} => net ${e(x.net)}/mois (${(x.netParJoueur * 100).toFixed(1)} c/joueur) ~${e(x.netApresCotisations)} après cotisations ; variante ajustée ${e(r.ajuste[n].net)}`);
      console.log(`         joueurs pour 100/500/1000 € nets : ${Object.values(r.objectifs[n]).join(' / ')}`);
    }
    console.log(`Tout maximiser = ${r.jetons.pourToutMaximiser} jetons : ${r.jetons.cout} € en achetant (gratuit en ~${r.jetons.semainesGratuites} semaines).`);
  }
}
