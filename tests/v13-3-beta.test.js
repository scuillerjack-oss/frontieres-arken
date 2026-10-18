// V13.3 — retours de bêta de Jack (18/10/2026, partie perdue) : forteresse un niveau à la fois, « artilleur » au
// lieu de « canon », combat expliqué (forces engagées, PV perdus, forteresse −10/−20/−30 %), attaque bien visible
// au journal, un seul bouton pour parler à un dirigeant, liserés de la même épaisseur.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { RULES } from '../src/domain/constants.js';
import { queueConstruction, resolveInterturn, journalEntry, FORT_IN_PROGRESS, buildingCount } from '../src/domain/game-engine.js';
import { resolveBattle } from '../src/domain/combat.js';
import { buildingUnavailableReason, journalCategoryClass } from '../src/presentation/v5-ux.js';
import { arkenV9Map } from '../src/map/arken-v9-map.js';
import { map, freshState } from './helpers/fixtures.js';

const read = f => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

test('forteresse : un niveau à la fois (moteur et écran)', () => {
  const s = freshState({ allHuman: true });
  s.nations.valmorne.treasury = 500;
  assert.equal(queueConstruction(s, { nationId: 'valmorne', provinceId: 'p01', type: 'fort' }).ok, true);
  assert.equal(queueConstruction(s, { nationId: 'valmorne', provinceId: 'p01', type: 'fort' }).error, FORT_IN_PROGRESS);
  const rule = RULES.buildings.fort;
  assert.match(buildingUnavailableReason({ type: 'fort', label: 'Forteresse', rule, count: 1, built: 0 }), /niveau 1 en construction, attendez/);
  assert.equal(buildingUnavailableReason({ type: 'fort', label: 'Forteresse', rule, count: 1, built: 1 }), '');
  for (let i = 0; i < 6 && s.provinces.p01.buildings.fort < 1; i++) resolveInterturn(s, map);
  assert.equal(buildingCount(s, 'p01', 'fort'), 1);
  assert.equal(queueConstruction(s, { nationId: 'valmorne', provinceId: 'p01', type: 'fort' }).ok, true, 'niveau 1 fini : le 2 se lance');
});

test('« artilleur(s) » partout, plus jamais « canon(s) » pour l\'unité', () => {
  for (const f of ['src/presentation/v5-ux.js', 'src/presentation/v13-vision-ui.js', 'src/domain/game-engine.js']) assert.doesNotMatch(read(f), /'canons?'/, f);
  const ev = { type: 'battle', attacker: 'oroel', attackers: ['oroel'], defender: 'valmorne', provinceId: 'p03', naval: false,
    lossesByNation: { oroel: { infantry: 0, cavalry: 0, armor: 0, artillery: 1, warship: 0 }, valmorne: { infantry: 5, cavalry: 0, armor: 0, artillery: 0, warship: 0 } } };
  assert.match(journalEntry(ev, arkenV9Map, 'valmorne').text, /1 artilleurs?/);
});

test('forteresse : −10 / −20 / −30 % de dégâts reçus', () => {
  const g = { units: { infantry: 400 } }, a = { units: { infantry: 400 } };
  const lost = lvl => resolveBattle({ defender: g, attackers: [{ id: 'a', force: a }], fortLevel: lvl, passes: 1 }).defenderHpLost;
  assert.equal(lost(0), 2000);
  assert.deepEqual([1, 2, 3].map(lost), [1800, 1600, 1400]);
});

test('combat expliqué : forces engagées, PV perdus, forteresse et débarquement ; attaque subie bien visible', () => {
  const s = freshState({ allHuman: true });
  s.provinces.p04.units = { ...s.provinces.p04.units, infantry: 300, armor: 15 };
  s.provinces.p05.buildings.fort = 3; s.provinces.p05.units = { ...s.provinces.p05.units, infantry: 340, cavalry: 0, armor: 0, artillery: 0 };
  s.orders.push({ id: 'x', kind: 'move', nationId: 'valmorne', fromId: 'p04', toId: 'p05', units: { infantry: 300, cavalry: 0, armor: 15, artillery: 0 }, warships: 0, routeType: 'land', status: 'pending', turn: s.turn });
  resolveInterturn(s, map);
  const ev = s.events.find(e => (e.type === 'conquest' || e.type === 'battle') && e.provinceId === 'p05');
  assert.ok(ev.engagedByNation && ev.hpLostByNation, 'détails enregistrés');
  const forDefender = journalEntry(ev, map, 'roc-epine');
  assert.match(forDefender.text, /Forces engagées : .*15 blindés/);
  assert.match(forDefender.text, /PV perdus \(blessés compris\)/);
  assert.match(forDefender.text, /forteresse niveau 3 : −30 % de dégâts reçus/);
  assert.equal(journalCategoryClass(forDefender.type), 'under-attack');
  assert.match(forDefender.type, /⚠/);
  assert.notEqual(journalCategoryClass(journalEntry(ev, map, 'valmorne').type), 'under-attack', 'l\'attaquant n\'a pas l\'alerte');
  assert.doesNotMatch(journalEntry(ev, map, 'noireflamme').text, /Forces engagées/, 'détail réservé aux nations impliquées');
  assert.match(read('v5.css'), /\.journal-entry\.under-attack\{/);
});

test('interface : plus de bouton « Échanger » dans la fiche ; liserés de 28 px partout', () => {
  assert.doesNotMatch(read('app.js'), /\['talk','Échanger'\]/);
  assert.match(read('v5.css'), /\.territory\.war,\.territory\.ally,\.territory\.brink\{stroke-width:calc\(28px/);
});
