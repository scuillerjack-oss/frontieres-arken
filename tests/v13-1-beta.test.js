// V13.1 — retours de bêta du 18/10/2026 :
//  1. « Les banques, usines et ports rapportent des pièces à chaque tour : ce n'est pas indiqué, et j'ai l'impression
//     que ce n'est pas effectif. » → revenus affichés (construction, fiche, journal) ; le port rapporte désormais +2.
//  2. « Mes troupes envoyées par la mer ne sont jamais arrivées, elles ont disparu. » → elles étaient anéanties au
//     débarquement (ligne noyée dans le journal) : fenêtre dédiée « Débarquement repoussé » / « Convoi coulé ».
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { arkenV9Map as map } from '../src/map/arken-v9-map.js';
import { createGameState } from '../src/state/create-game-state.js';
import { RULES } from '../src/domain/constants.js';
import { incomeFor, incomeBreakdown, buildingIncome, resolveInterturn, queueMoveOrder, availableForces, legalDestinations } from '../src/domain/game-engine.js';
import { seaFatePopups } from '../src/presentation/v13-ux.js';

const names = { nation: id => map.nations.find(n => n.id === id).short, province: id => map.provinces.find(p => p.id === id).name };
const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');

test('revenus : 4 or par province, +3 par banque, +3 par usine, +2 par port construit', () => {
  assert.equal(RULES.portIncome, 2);
  assert.deepEqual([buildingIncome('bank'), buildingIncome('factory'), buildingIncome('port'), buildingIncome('fort')], [3, 3, 2, 0]);
  const s = createGameState({ map, playerNationId: 'valmorne' });
  const before = incomeFor(s, 'valmorne');
  assert.equal(before, 4 * RULES.baseIncome);
  Object.assign(s.provinces.p02.buildings, { bank: 1, factory: 1, port: 1, fort: 2 });
  assert.deepEqual(incomeBreakdown(s, 'valmorne'), { provinces: 4, banks: 1, factories: 1, ports: 1, total: before + 8 });
});

test('revenus : les banques sont bien créditées au trésor et une ligne « Revenus du tour » arrive au journal', () => {
  const s = createGameState({ map, playerNationId: 'valmorne' });
  for (const id of map.nations.map(n => n.id)) s.controllers[id] = 'human'; // pas d'IA : seul le revenu bouge le trésor
  s.provinces.p03.buildings.bank = 1;
  const gold = s.nations.valmorne.treasury;
  resolveInterturn(s, map);
  assert.equal(s.nations.valmorne.treasury, gold + 4 * RULES.baseIncome + RULES.bankIncome);
  const line = s.turnJournal.find(e => e.type === 'REVENUS');
  assert.ok(line, 'ligne de revenus au journal');
  assert.match(line.text, /\+19 or \(4 provinces × 4 · 1 banque × 3\)/);
  assert.equal(s.events.filter(e => e.type === 'income').length, 1, 'un seul événement de revenu : celui du joueur');
});

test('interface : la fenêtre de construction et la fiche affichent ce que rapporte chaque bâtiment', () => {
  assert.ok(app.includes('rapporte +${buildingIncome(x.type)} or/tour'));
  assert.ok(app.includes('💰 Rapporte +${yieldGold} or/tour'));
});

test('convoi anéanti au débarquement (partie réelle) : fenêtre « Débarquement repoussé », aucun survivant', () => {
  const s = createGameState({ map, playerNationId: 'valmorne', seed: 'beta-18-10' });
  const dest = legalDestinations(map, s, 'p02').find(d => d.type === 'sea');
  assert.equal(dest.id, 'p05');
  const units = { ...availableForces(s, 'p02') }; delete units.warships;
  assert.ok(queueMoveOrder(s, map, { nationId: 'valmorne', fromId: 'p02', toId: 'p05', units, warships: 0 }).ok);
  const start = s.events.length;
  resolveInterturn(s, map); resolveInterturn(s, map);
  const pops = seaFatePopups(s.events.slice(start), 'valmorne', names);
  assert.equal(pops.length, 1);
  assert.equal(pops[0].kind, 'wiped');
  assert.equal(pops[0].title, '⚓ Débarquement repoussé');
  assert.match(pops[0].lead, /Tout le convoi a péri à Roc-Épine/);
  assert.match(pops[0].text, /Aucun survivant/);
});

test('débarquement repoussé avec survivants, convoi coulé, convoi perdu : chaque cas a sa fenêtre', () => {
  const events = [
    { type: 'battle', naval: true, attacker: 'valmorne', attackers: ['valmorne'], defender: 'roc-epine', provinceId: 'p05', lossesByNation: { valmorne: { infantry: 30 }, 'roc-epine': { infantry: 12 } } },
    { type: 'convoy-returning', reason: 'repelled', nationId: 'valmorne', provinceId: 'p05', toId: 'p02', amount: 25, turns: 2 },
    { type: 'interception', kind: 'port', attacker: 'oroel', defender: 'valmorne', provinceId: 'p14', fromId: 'p03', toId: 'p14', convoyDestroyed: true, lossesByNation: { valmorne: { infantry: 40 } } },
    { type: 'retreat-lost', naval: true, nationId: 'valmorne', provinceId: 'p02', amount: 7 },
    // ne concernent pas le joueur : aucune fenêtre
    { type: 'battle', naval: true, attacker: 'aurel', defender: 'valmorne', provinceId: 'p02', lossesByNation: {} },
    { type: 'interception', attacker: 'valmorne', defender: 'oroel', convoyDestroyed: true }
  ];
  const pops = seaFatePopups(events, 'valmorne', names);
  assert.deepEqual(pops.map(p => p.kind), ['repelled', 'sunk', 'stranded']);
  assert.match(pops[0].lead, /30 unités perdues à Roc-Épine/);
  assert.match(pops[0].text, /25 survivants rembarquent et rentrent à Sylvaren \(2 tours\)/);
  assert.match(pops[1].text, /flotte du port de Nordhème/);
  assert.match(pops[2].lead, /7 unités perdues/);
});

test('interface : les fenêtres du sort des convois suivent la prise de capitale ; l\'ordre de débarquement prévient', () => {
  assert.ok(app.includes('await showCapitalPopups(events);\n    await showSeaPopups(events);'));
  assert.ok(app.includes('⚠ Garnison inconnue : la province est hors de vue.'));
});
