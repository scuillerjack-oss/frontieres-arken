#!/usr/bin/env node
// FRONTIÈRES: ARKEN — V17.0 / V17.7 : rentabilité du TEMPS RÉEL (projection ; règles codées en V17.7, lues dans
// RULES.realtime.ads / .premium, donc toujours les mêmes que le jeu). Déterministe, sans réseau.
//   node tools/v17/economie-v17.mjs          (--json : sortie lisible par un programme)
// Reprend les hypothèses de marché de tools/economie-v14-4.mjs (eCPM, remplissage, consentement, commission, TVA) et
// remplace le modèle « 1 pub plein écran par partie » par un modèle au TEMPS DE JEU (docs/V17-cahier-des-charges.md §10) :
//   - pub imposée : au plus 1 toutes les 10 min de jeu (horloge qui tourne), servie seulement à un moment calme (pause,
//     menu, retour dans le jeu) : part des fenêtres de 10 min où un tel moment arrive = `momentCalme` ;
//     jamais pour un Premium (ni pour un ancien Pack débutant, qui vaut Premium), jamais dans le tutoriel ;
//   - pub récompensée : icône disponible toutes les 5 à 10 min de jeu (7,5 min en moyenne) ; part des icônes touchées = `prisRecomp` ;
//   - les pubs « mission » et « bonus » de la V14.4 restent (Atouts & missions) : même formule que la V14.4 ;
//   - Premium 1,99 € (achat unique : vitesse ×2 + plus de pub imposée) ; Pack débutant 2,99 € = Premium + 3 jetons ;
//   - rétention : les joueurs non Premium jouent `retention` × leurs minutes (les pubs imposées font fuir une partie d'entre eux).
import { SCENARIOS as V14, netAchat, TVA, COMMISSION_GOOGLE } from '../economie-v14-4.mjs';
import { REALTIME_RULES } from '../../src/domain/realtime/rules.js';

const ADS = REALTIME_RULES.ads, PREMIUM = REALTIME_RULES.premium;

export const JOUEURS = 10000;
export const COUT_FONCTIONNEMENT_MENSUEL = 0;
export const COTISATIONS_APPROX = 0.22;
export const PRIX = Object.freeze({ premium: PREMIUM.priceEur, pack_debutant: PREMIUM.starterPackEur, jetons_1: 0.49, jetons_5: 1.99, jetons_12: 3.99 });
export const MINUTES_ENTRE_PUBS_IMPOSEES = ADS.forcedEveryMinutes;
export const MINUTES_ENTRE_PUBS_RECOMPENSEES = (ADS.rewardedMinMinutes + ADS.rewardedMaxMinutes) / 2; // 5 à 10 min : 7,5 en moyenne
const FACTEUR_SANS_CONSENTEMENT = 0.4, JOURS_AVEC_MISSION_PUB = 0.7, ACHATS_PAR_ACHETEUR_JETONS = 1.3;
const MIX_JETONS = { jetons_1: 0.2, jetons_5: 0.5, jetons_12: 0.3 };

export const SCENARIOS = Object.freeze({
  bas:     { ...V14.bas,     minutesSession: 12, momentCalme: 0.5,  prisRecomp: 0.08, convPremium: 0.005, convPack: 0.002, retention: 0.85 },
  central: { ...V14.central, minutesSession: 20, momentCalme: 0.7,  prisRecomp: 0.15, convPremium: 0.015, convPack: 0.005, retention: 0.90 },
  haut:    { ...V14.haut,    minutesSession: 30, momentCalme: 0.85, prisRecomp: 0.25, convPremium: 0.030, convPack: 0.010, retention: 0.95 }
});
const valeurEcpm = (ecpm, s) => ecpm * (s.consentement + (1 - s.consentement) * FACTEUR_SANS_CONSENTEMENT);

export function simuler(s, joueurs = JOUEURS) {
  const premium = joueurs * (s.convPremium + s.convPack);            // nouveaux acheteurs du mois (sans pub imposée)
  const autres = joueurs - premium;
  const minutes = s.joursJeu * s.minutesSession;                      // minutes de jeu par joueur et par mois
  const minutesAutres = minutes * s.retention;
  const imposees = autres * (minutesAutres / MINUTES_ENTRE_PUBS_IMPOSEES) * s.momentCalme * s.remplissage;
  const recompTempsReel = (autres * minutesAutres + premium * minutes) / MINUTES_ENTRE_PUBS_RECOMPENSEES * s.prisRecomp * s.remplissage;
  const recompMissions = joueurs * s.joursJeu * JOURS_AVEC_MISSION_PUB * s.partRecomp * s.remplissage;
  const pubsImposees = imposees / 1000 * valeurEcpm(s.ecpmInter, s);
  const pubsRecomp = (recompTempsReel + recompMissions) / 1000 * valeurEcpm(s.ecpmRecomp, s);
  const achatsPremium = joueurs * s.convPremium * netAchat(PRIX.premium) + joueurs * s.convPack * netAchat(PRIX.pack_debutant);
  const panier = Object.entries(MIX_JETONS).reduce((t, [id, p]) => t + p * PRIX[id], 0);
  const achatsJetons = joueurs * s.convJetons * ACHATS_PAR_ACHETEUR_JETONS * netAchat(panier);
  const net = pubsImposees + pubsRecomp + achatsPremium + achatsJetons - COUT_FONCTIONNEMENT_MENSUEL;
  return { joueurs, minutesParJoueur: minutes, pubsImposeesParJoueurNonPremium: +(imposees / Math.max(1, autres)).toFixed(1),
    vuesRecompParJoueur: +((recompTempsReel + recompMissions) / joueurs).toFixed(1), pubsImposees, pubsRecomp, achatsPremium, achatsJetons,
    net, netParJoueur: net / joueurs, netApresCotisations: net * (1 - COTISATIONS_APPROX) };
}
export const joueursPour = (s, cible) => Math.ceil(cible / simuler(s).netParJoueur);
export function rapport() {
  const out = { netPremium: +netAchat(PRIX.premium).toFixed(2), netPack: +netAchat(PRIX.pack_debutant).toFixed(2), scenarios: {}, objectifs: {}, seuil: {} };
  for (const [n, s] of Object.entries(SCENARIOS)) {
    out.scenarios[n] = simuler(s); out.objectifs[n] = Object.fromEntries([100, 500, 1000].map(c => [c, joueursPour(s, c)]));
    // Seuil de rentabilité : 0 € de coût de fonctionnement => le premier joueur qui rapporte quoi que ce soit suffit.
    out.seuil[n] = { joueurs: simuler(s, 1).net > COUT_FONCTIONNEMENT_MENSUEL ? 1 : null, coutMensuel: COUT_FONCTIONNEMENT_MENSUEL };
  }
  return out;
}
const e = x => `${Math.round(x)} €`;
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  const r = rapport();
  if (process.argv.includes('--json')) console.log(JSON.stringify(r, null, 2));
  else {
    console.log(`ARKEN V17 (temps réel, projection) — net mensuel pour ${JOUEURS} joueurs actifs ; Premium net ${r.netPremium} € (TVA ${TVA * 100} %, Google ${COMMISSION_GOOGLE * 100} %)`);
    for (const [n, x] of Object.entries(r.scenarios)) {
      console.log(`${n.padEnd(8)} ${x.minutesParJoueur} min/mois | imposées ${e(x.pubsImposees)} (${x.pubsImposeesParJoueurNonPremium}/joueur) | récompensées ${e(x.pubsRecomp)} (${x.vuesRecompParJoueur}/joueur) | Premium+Pack ${e(x.achatsPremium)} | jetons ${e(x.achatsJetons)} => ${e(x.net)}/mois (~${e(x.netApresCotisations)} après cotisations)`);
      console.log(`         joueurs pour 100/500/1000 € nets : ${Object.values(r.objectifs[n]).join(' / ')}`);
    }
  }
}
