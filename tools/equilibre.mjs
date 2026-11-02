// V15 — Simulation reproductible du jeu, sans navigateur. Deux usages :
//
//   node tools/equilibre.mjs [parties=60] [tours=80] [préfixe=eq]
//     Parties IA contre IA : mêmes mesures que le constat de docs/V15-cahier-des-charges.md (signaux, pas preuves).
//
//   node tools/equilibre.mjs --joueur=prudent|dominant [parties=100] [tours=80] [préfixe=eq]
//     Contrôle V15.1 : un joueur humain scripté (tools/joueurs-scriptes.mjs) contre 4 IA. Aucune triche, ordres ordinaires.
//
//   --difficulte=facile|normal|difficile (V15.3) : pour les deux usages ci-dessus, niveau des parties (Normal par défaut).
//
//   --longueur=40 (V15.4) : parties courtes, pour les mesures comme pour les empreintes ; tranches au quart de la longueur.
//
//   node tools/equilibre.mjs --empreintes [--graines=10] [--ecrire=fichier.json] [--verifier=fichier.json]
//     Empreintes (SHA-256) de l'état complet de parties à graine fixe : sert à prouver qu'un découpage du code ne change
//     pas le jeu. Rien n'est écarté de l'état : événements, journal, clé `tutorial`, compteurs, tout compte.
//     --verifier sort en erreur (code 1) à la première différence.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { arkenV9Map as map } from '../src/map/arken-v9-map.js';
import { createGameState } from '../src/state/create-game-state.js';
import { encodeSave, decodeSave } from '../src/persistence/save-codec.js';
import { RULES } from '../src/domain/constants.js';
import * as engine from '../src/domain/game-engine.js';
import { setPlayerBonuses } from '../src/domain/boosts.js';
import { talkOptions, queueTalk } from '../src/domain/talk.js';
import { queueHelpRequest } from '../src/domain/alliances.js';
import { joueurPrudent, joueurDominant } from './joueurs-scriptes.mjs';

// Le tutoriel a changé de nom de fichier en V15.0 ; l'outil tourne aussi sur l'ancien code pour pouvoir comparer.
const tutorialModule = await import('../src/presentation/tutorial.js')
  .catch(() => import('../src/presentation/v14-3-tutoriel.js'));

const { resolveInterturn, gameRanking, queueRecruitment, queueConstruction, queueMoveOrder, queueDiplomaticOrder, queueBombard,
  legalDestinations, availableForces, proposalsToAnswer, respondToProposal, bombardStatus, spendableTreasury, journalEntry } = engine;

const NATIONS = map.nations.map(n => n.id), LAND = ['infantry', 'cavalry', 'armor', 'artillery'];
const ownersOf = s => Object.fromEntries(Object.entries(s.provinces).map(([id, p]) => [id, p.ownerId]));
const owned = (s, id) => Object.keys(s.provinces).filter(p => s.provinces[p].ownerId === id);
const median = list => { const a = [...list].sort((x, y) => x - y); return a.length ? a[Math.floor((a.length - 1) / 2)] : 0; };
const sha = text => createHash('sha256').update(text).digest('hex');

// Le moteur ne doit jamais tirer au hasard hors de sa graine : un appel à Math.random arrête tout.
Math.random = () => { throw new Error('Math.random appelé pendant une simulation'); };

// --- Mesures du constat -----------------------------------------------------------------------------------------
function mesurer(parties, tours, prefixe, difficulty, gameLength) {
  const pasTranche = (gameLength || 80) / 4;
  const tranches = [0, 0, 0, 0], derniere = [], premier = [], second = [], eliminees = [];
  const parNation = Object.fromEntries(NATIONS.map(id => [id, 0])), parCaractere = {};
  let vainqueurNet = 0;
  let capitales5 = 0, capitalesPerdues = 0, avecElimination = 0, avecCoalition = 0, coalitionsTours = 0;
  for (let g = 0; g < parties; g++) {
    const s = createGameState({ map, playerNationId: NATIONS[g % NATIONS.length], seed: `${prefixe}-${g}`, difficulty, gameLength });
    for (const id of NATIONS) s.controllers[id] = 'ai';
    let last = 0;
    for (let i = 0; i < tours && !s.gameOver; i++) {
      const turn = s.turn, before = ownersOf(s);
      resolveInterturn(s, map);
      const after = ownersOf(s);
      for (const p of Object.keys(after)) if (after[p] !== before[p]) {
        tranches[Math.min(3, Math.floor((turn - 1) / pasTranche))]++; last = turn;
        if (s.nations[before[p]]?.capitalId === p) capitalesPerdues++;
      }
    }
    derniere.push(last);
    const rank = gameRanking(s), winner = s.gameOver?.winnerId || rank[0].nationId;
    if (s.gameOver?.reason === 'capitals' || rank[0].provinces > (rank[1]?.provinces || 0)) vainqueurNet++;
    premier.push(rank[0].provinces); second.push(rank[1]?.provinces || 0);
    eliminees.push(NATIONS.filter(id => s.nations[id].eliminated).length);
    if (eliminees.at(-1) > 0) avecElimination++;
    if (s.events.some(e => e.type === 'coalition-formed')) avecCoalition++;
    parNation[winner]++;
    const arch = s.leaders?.[winner]?.archetype || 'joueur';
    parCaractere[arch] = (parCaractere[arch] || 0) + 1;
    if (s.gameOver?.reason === 'capitals') capitales5++;
  }
  return { parties, tours, prefixe, longueur: gameLength || 80, partiesAvecVainqueurNet: vainqueurNet, changementsParTranche: tranches, derniereConqueteMediane: median(derniere),
    vainqueurProvincesMediane: median(premier), secondProvincesMediane: median(second), nationsElimineesMediane: median(eliminees),
    victoiresParCapitales: capitales5, capitalesPerduesParPartie: +(capitalesPerdues / Math.max(1, parties)).toFixed(2),
    partiesAvecElimination: Math.round(100 * avecElimination / Math.max(1, parties)), partiesAvecCoalition: Math.round(100 * avecCoalition / Math.max(1, parties)),
    tranche4SurTranche1: Math.round(100 * tranches[3] / Math.max(1, tranches[0])), victoiresParNation: parNation, victoiresParCaractere: parCaractere };
}

// --- Empreintes -------------------------------------------------------------------------------------------------
/** Joueur scripté : essaie un peu de tout, de façon déterministe. Chaque réponse du moteur (même un refus) est journalisée. */
/** V15.1 : un joueur scripté contre 4 IA, toutes nations à tour de rôle. Ce qui compte : vit-il, gagne-t-il, la coalition le vise-t-elle ? */
function controle(type, parties, tours, prefixe, difficulty, gameLength) {
  const script = type === 'dominant' ? joueurDominant : joueurPrudent;
  const r = { type, parties, victoires: 0, elimines: 0, eliminationTours: [], provincesFinMediane: 0, rangMoyen: 0, coalitionContreLui: 0, toursSousCoalition: 0, sousCoalitionGagne: 0, parCapitales: 0, parNation: Object.fromEntries(NATIONS.map(n => [n, [0, 0]])) };
  const prov = [];
  for (let g = 0; g < parties; g++) {
    const nation = NATIONS[g % NATIONS.length], s = createGameState({ map, playerNationId: nation, seed: `${prefixe}-${type}-${g}`, difficulty, gameLength });
    let sous = 0;
    for (let i = 0; i < tours && !s.gameOver; i++) { script(s, map, engine); resolveInterturn(s, map); if (s.coalition?.target === nation) sous++; }
    const rank = gameRanking(s), mine = rank.find(x => x.nationId === nation), won = (s.gameOver?.winnerId || rank[0].nationId) === nation && s.gameOver?.reason !== 'player-eliminated';
    r.parNation[nation][1]++;
    if (won) { r.victoires++; r.parNation[nation][0]++; if (sous) r.sousCoalitionGagne++; if (s.gameOver?.reason === 'capitals') r.parCapitales++; }
    if (s.nations[nation].eliminated) { r.elimines++; r.eliminationTours.push(s.nations[nation].eliminatedTurn); }
    if (sous) r.coalitionContreLui++;
    r.toursSousCoalition += sous; r.rangMoyen += mine.rank; prov.push(mine.provinces);
  }
  r.rangMoyen = +(r.rangMoyen / parties).toFixed(2); r.toursSousCoalition = +(r.toursSousCoalition / Math.max(1, r.coalitionContreLui)).toFixed(1);
  r.provincesFinMediane = median(prov); r.eliminationTours.sort((a, b) => a - b);
  return r;
}

function ordresScriptes(s, log) {
  const me = s.playerNationId, mine = owned(s, me), t = s.turn;
  const note = (what, r) => log.push(`${t}:${what}:${r?.ok === undefined ? JSON.stringify(r) : r.ok ? 'ok' : r.error}`);
  const others = NATIONS.filter(id => id !== me && !s.nations[id].eliminated);
  if (!mine.length) return;
  const target = others[t % Math.max(1, others.length)];

  for (const p of proposalsToAnswer(s, me)) note('reponse', respondToProposal(s, { nationId: me, from: p.from, accept: t % 2 === 0 }));

  const capital = s.nations[me].capitalId, base = mine.includes(capital) ? capital : mine[0];
  const type = ['infantry', 'cavalry', 'armor', 'artillery', 'warship'][t % 5];
  note('recrue', queueRecruitment(s, { nationId: me, provinceId: base, type, lots: 1 + t % 3 }));
  note('or', spendableTreasury(s, me));
  const lieu = mine[t % mine.length], bat = ['bank', 'factory', 'fort', 'port'][t % 4];
  note('batiment', queueConstruction(s, { nationId: me, provinceId: lieu, type: bat }));

  if (t === 3 || t === 30) note('alliance', queueDiplomaticOrder(s, { nationId: me, target, action: 'alliance' }));
  if (t === 5 || t === 25 || t === 55) note('guerre', queueDiplomaticOrder(s, { nationId: me, target, action: 'war' }));
  if (t === 15 || t === 45) note('treve', queueDiplomaticOrder(s, { nationId: me, target, action: 'ceasefire', pay: 10, demand: 0 }));
  if (t === 35) note('rupture', queueDiplomaticOrder(s, { nationId: me, target, action: 'break' }));
  if (t % 7 === 0) note('aide', queueHelpRequest(s, { from: me, to: target, kind: 'attack', target: others[0] }));
  if (t % 4 === 1) {
    const opts = talkOptions(s, map, { from: me, to: target }) || [];
    log.push(`${t}:paroles:${JSON.stringify(opts)}`);
    const tone = opts[t % Math.max(1, opts.length)]?.tone ?? opts[0]?.id;
    if (tone) note('parole', queueTalk(s, map, { from: me, to: target, tone }));
  }

  for (const from of mine) {
    const st = bombardStatus(map, s, { nationId: me, fromId: from });
    if (st.ok && st.targets?.length) note('bombarde', queueBombard(s, map, { nationId: me, fromId: from, toId: st.targets[0].id ?? st.targets[0], warships: 1 }));
    const dest = legalDestinations(map, s, from);
    if (!dest.length || (t + from.charCodeAt(2)) % 2) continue;
    const force = availableForces(s, from, me);
    const units = Object.fromEntries(LAND.map(k => [k, Math.floor((force[k] || 0) * .6)]));
    const route = dest[t % dest.length];
    note('deplace', queueMoveOrder(s, map, { nationId: me, fromId: from, toId: route.id, units, warships: Math.floor((force.warships || 0) / 2) }));
  }
}

const finale = (s, log = []) => {
  // Tout ce qui sort du moteur en fin de partie : état complet, journal rendu en texte, classement, réponses aux ordres.
  const journal = s.events.map(e => { try { return journalEntry(e, map, s.playerNationId); } catch (err) { return `ERREUR ${err.message}`; } });
  return { etat: sha(JSON.stringify(s)), journal: sha(JSON.stringify(journal)), classement: sha(JSON.stringify(gameRanking(s))), ordres: sha(log.join('\n')),
    tour: s.turn, fin: s.gameOver?.reason || null, vainqueur: s.gameOver?.winnerId || null, evenements: s.events.length };
};

function partie({ seed, nation, tours = 80, script = false, bonus = null, sauvegarde = false, etat = null, gameLength }) {
  let s = etat || createGameState({ map, playerNationId: nation, seed, gameLength });
  if (!script) for (const id of NATIONS) s.controllers[id] = 'ai';
  if (bonus) setPlayerBonuses(s, bonus);
  const log = [];
  let chaine = '';
  for (let i = 0; i < tours && !s.gameOver; i++) {
    if (script) ordresScriptes(s, log);
    resolveInterturn(s, map);
    chaine = sha(chaine + JSON.stringify(s)); // chaque tour compte, pas seulement le dernier
    if (sauvegarde && i % 10 === 9) s = decodeSave(encodeSave(s));
  }
  return { ...finale(s, log), chaine };
}

/** V15.4 : empreintes des Parties courtes, dans leur propre fichier ; celui des 80 tours ne bouge pas. */
function empreintesCourtes(graines, gameLength) {
  const out = { regles: sha(JSON.stringify(RULES)), carte: sha(JSON.stringify(map)), api: Object.keys(engine).sort(), parties: {} };
  for (let g = 0; g < graines; g++) for (const nation of NATIONS) {
    const seed = `empreinte-${gameLength}-${g}`;
    out.parties[`ia/${seed}/${nation}`] = partie({ seed, nation, gameLength });
    if (g < 2) out.parties[`script/${seed}/${nation}`] = partie({ seed, nation, script: true, gameLength });
  }
  for (const nation of NATIONS) out.parties[`sauvegarde/${nation}`] = partie({ seed: `empreinte-${gameLength}-sauve`, nation, script: true, sauvegarde: true, gameLength });
  return out;
}

function empreintes(graines) {
  const out = { regles: sha(JSON.stringify(RULES)), carte: sha(JSON.stringify(map)), api: Object.keys(engine).sort(), parties: {} };
  for (let g = 0; g < graines; g++) for (const nation of NATIONS) {
    const seed = `empreinte-${g}`;
    out.parties[`ia/${seed}/${nation}`] = partie({ seed, nation });
    if (g < 4) out.parties[`script/${seed}/${nation}`] = partie({ seed, nation, script: true });
  }
  for (const nation of NATIONS) {
    out.parties[`sauvegarde/${nation}`] = partie({ seed: 'empreinte-sauve', nation, script: true, sauvegarde: true });
    out.parties[`atouts/${nation}`] = partie({ seed: 'empreinte-atouts', nation, script: true, bonus: { gold: 10, recruit: 10, build: 1, fort: 10, naval: 10 } });
  }
  out.parties.tutoriel = partie({ seed: 'tutoriel', tours: 30, script: true, etat: tutorialModule.createTutorialState({ map }) });
  return out;
}

const args = process.argv.slice(2);
const option = name => args.find(a => a.startsWith(`--${name}=`))?.split('=')[1];
if (args.includes('--empreintes')) {
  const graines = Number(option('graines') || 10);
  const resultat = option('longueur') ? empreintesCourtes(graines, Number(option('longueur'))) : empreintes(graines);
  const n = Object.keys(resultat.parties).length;
  if (option('ecrire')) { writeFileSync(option('ecrire'), JSON.stringify(resultat, null, 1) + '\n'); console.log(`${n} parties écrites dans ${option('ecrire')}`); }
  if (option('verifier')) {
    const ref = readFileSync(option('verifier'), 'utf8'), now = JSON.stringify(resultat, null, 1) + '\n';
    if (ref !== now) {
      const a = JSON.parse(ref), diffs = Object.keys({ ...a.parties, ...resultat.parties }).filter(k => JSON.stringify(a.parties[k]) !== JSON.stringify(resultat.parties[k]));
      for (const k of ['regles', 'carte', 'api']) if (JSON.stringify(a[k]) !== JSON.stringify(resultat[k])) diffs.unshift(k);
      console.error(`DIFFÉRENCE sur ${diffs.length} entrées : ${diffs.slice(0, 10).join(', ')}`);
      process.exit(1);
    }
    console.log(`${n} parties : empreintes strictement identiques à ${option('verifier')} (${sha(now).slice(0, 16)})`);
  }
  if (!option('ecrire') && !option('verifier')) console.log(JSON.stringify(resultat, null, 1));
} else {
  const positional = args.filter(a => !a.startsWith('--'));
  const [parties = 60, tours = 80, prefixe = 'eq'] = positional;
  if (option('joueur')) console.log(JSON.stringify(controle(option('joueur'), Number(parties), Number(tours), prefixe, option('difficulte'), option('longueur') ? Number(option('longueur')) : undefined)));
  else console.log(JSON.stringify(mesurer(Number(parties), Number(tours), prefixe, option('difficulte'), option('longueur') ? Number(option('longueur')) : undefined), null, 1));
}
