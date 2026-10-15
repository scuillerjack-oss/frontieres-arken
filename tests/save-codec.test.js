import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeSave, decodeSave, migrateSave } from '../src/persistence/save-codec.js';
import { resolveInterturn, queueMoveOrder, queueConstruction, setRelation, queueDiplomaticOrder } from '../src/domain/game-engine.js';
import { SAVE_KEY } from '../src/presentation/v4-ux.js';
import { map, freshState } from './helpers/fixtures.js';

test('clé de stockage localStorage figée', () => {
  assert.equal(SAVE_KEY, 'frontieres-arken-v2-save');
});

test('aller-retour encode/decode sans perte : partie neuve', () => {
  const s = freshState();
  assert.deepEqual(decodeSave(encodeSave(s)), s);
});

test('aller-retour sans perte : partie avancée avec ordres, guerres, file de production', () => {
  const s = freshState({ player: 'valmorne' });
  for (let i = 0; i < 25; i++) resolveInterturn(s, map);
  queueConstruction(s, { nationId: 'valmorne', provinceId: s.nations.valmorne.capitalId, type: 'fort' });
  const owned = Object.keys(s.provinces).find(id => s.provinces[id].ownerId === 'valmorne' && map.provinces.find(p => p.id === id).landConnections.length);
  if (owned) queueMoveOrder(s, map, { nationId: 'valmorne', fromId: owned, toId: map.provinces.find(p => p.id === owned).landConnections[0], units: { infantry: 1 } });
  setRelation(s, { nationId: 'valmorne', target: 'aurel', type: 'war' });
  queueDiplomaticOrder(s, { nationId: 'valmorne', target: 'aurel', action: 'ceasefire', offerLevel: .75 });
  const text = encodeSave(s);
  const back = decodeSave(text);
  assert.deepEqual(back, s);
  assert.equal(encodeSave(back), text);
  // La partie reprise évolue exactement comme l'originale.
  resolveInterturn(s, map); resolveInterturn(back, map);
  assert.deepEqual(back, s);
});

test('schéma 5 conservé ; schémas inconnus refusés', () => {
  const s = freshState();
  assert.equal(JSON.parse(encodeSave(s)).schemaVersion, 5);
  assert.throws(() => decodeSave(JSON.stringify({ ...s, schemaVersion: 6 })), /unsupported_save_schema:6/);
  assert.throws(() => migrateSave(null), /invalid_save/);
  assert.throws(() => decodeSave('pas du json'));
});

test('migration v4 -> v5 : cessez-le-feu en attente rendu gratuit, champs ajoutés', () => {
  const s = freshState();
  const old = { ...structuredClone(s), schemaVersion: 4, orders: [{ id: 'o1', kind: 'diplomacy', action: 'ceasefire', status: 'pending', nationId: 'valmorne', target: 'aurel' }], prisoners: [1] };
  delete old.chronicle; delete old.warChestsClaimed;
  const m = migrateSave(old);
  assert.equal(m.schemaVersion, 5);
  assert.equal(m.prisoners, undefined);
  assert.deepEqual(m.chronicle, []);
  assert.deepEqual(m.warChestsClaimed, {});
  assert.equal(m.orders[0].legacyFree, true);
  assert.equal(m.orders[0].amount, 0);
  assert.equal(m.orderSequence, 2);
});

test('migration v1-v3 : portSite déduit d\'un port déjà construit', () => {
  const s = freshState();
  const old = structuredClone(s); old.schemaVersion = 2;
  for (const p of Object.values(old.provinces)) delete p.portSite;
  old.provinces.p03.buildings.port = 1;
  const m = migrateSave(old);
  assert.equal(m.provinces.p03.portSite, true);
  assert.equal(m.provinces.p07.portSite, false); // sera ré-écrasé par hydrateState() dans app.js d'après la carte
});
