// V17.5b — Personnalités plus vivantes et moins prévisibles (demande de Jack, 19-20/11/2026). Module pur, déterministe :
// tout aléa vient de la graine de la partie (chance de leaders.js), jamais de Math.random. Ne sert qu'en temps réel.
//
//  - Tempérament : chaque dirigeant tire, à la graine, de petites variations de ses seuils (marges d'attaque, délais,
//    rapports de force) : ±RULES.realtime.ai.personality.jitter. Deux parties ne se ressemblent pas.
//  - Choix pondérés : une cible n'est pas « la plus faible » à coup sûr ; elle est tirée au sort, les plus faibles et les
//    plus proches ayant plus de chances (`weightedPick`). Le tirage change de période en période.
//  - Menace publique (`publicMenace`) : ce que tout le monde voit (agressions récentes, Conquérant démasqué), jamais le
//    caractère caché d'un dirigeant. Le Héros s'organise contre elle ; le Traître s'en sert de prétexte.
import { RULES } from '../constants.js';
import { aliveNations, chance, recentAggressions } from '../leaders.js';

const P = () => RULES.realtime.ai.personality;

/** Valeur `base` variée de ±spread (à la graine) pour ce dirigeant et cette clé : la même pendant toute la partie. */
export function temper(state, nationId, key, base, spread = P().jitter) {
  return base * (1 + (chance(state, 'temper', nationId, key) * 2 - 1) * spread);
}
/** Entier tiré entre lo et hi (inclus), à la graine, pour ce dirigeant et ces clés. */
export function between(state, [lo, hi], ...keys) {
  return lo + Math.floor(chance(state, 'between', ...keys) * (hi - lo + 1));
}
/** Tirage pondéré dans [{ id, w }] (w > 0), à la graine et aux clés ; null si la liste est vide. */
export function weightedPick(state, items, ...keys) {
  const list = items.filter(x => x.w > 0).sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const total = list.reduce((n, x) => n + x.w, 0);
  if (!total) return null;
  let r = chance(state, 'pick', ...keys) * total;
  for (const x of list) { r -= x.w; if (r < 0) return x.id; }
  return list.at(-1).id;
}
/**
 * La nation qui menace Arken aux yeux de `viewer`, d'après ce qui est PUBLIC : un Conquérant démasqué, ou la nation qui a
 * agressé le plus de victimes différentes récemment (au moins `menaceVictims`). Jamais `viewer` lui-même. null sinon.
 */
export function publicMenace(state, viewer) {
  const cfg = P().heros, alive = new Set(aliveNations(state));
  const revealed = [...alive].filter(id => id !== viewer && state.leaders?.[id]?.revealed && state.leaders[id].archetype === 'conquerant').sort();
  if (revealed.length) return revealed[0];
  const victims = {};
  for (const a of recentAggressions(state, cfg.menaceMemory)) if (a.attacker !== viewer && alive.has(a.attacker)) (victims[a.attacker] ||= new Set()).add(a.victim);
  const ranked = Object.entries(victims).filter(([, v]) => v.size >= cfg.menaceVictims).sort((a, b) => b[1].size - a[1].size || a[0].localeCompare(b[0]));
  return ranked[0]?.[0] || null;
}
