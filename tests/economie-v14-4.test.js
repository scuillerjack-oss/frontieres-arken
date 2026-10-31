// V14.4 — Fiche de rentabilité : la simulation tourne, résultats positifs et ordonnés, 0 € de coût de fonctionnement.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rapport, simuler, SCENARIOS, COUT_FONCTIONNEMENT_MENSUEL, coutJetons, PRIX } from '../tools/economie-v14-4.mjs';

test('simulation : déterministe, résultats positifs, haut > central > bas', () => {
  const a = rapport(), b = rapport();
  assert.deepEqual(a, b);
  const { bas, central, haut } = a.scenarios;
  for (const s of [bas, central, haut]) {
    assert.ok(s.net > 0 && s.pubsInter > 0 && s.pubsRecomp > 0 && s.achats > 0);
    assert.ok(Number.isFinite(s.netApresCotisations) && s.netApresCotisations < s.net);
  }
  assert.ok(haut.net > central.net && central.net > bas.net);
});

test('coût de fonctionnement nul : tout joueur rapporte, seuil de rentabilité = 1 joueur', () => {
  assert.equal(COUT_FONCTIONNEMENT_MENSUEL, 0);
  for (const s of Object.values(SCENARIOS)) assert.ok(simuler(s, 1).net > 0);
  const r = rapport();
  for (const n of Object.keys(SCENARIOS)) {
    assert.equal(r.seuil[n].joueurs, 1);
    const o = r.objectifs[n]; assert.ok(o[100] < o[500] && o[500] < o[1000]);
  }
});

test('prix : tout maximiser en achetant reste cher mais raisonnable', () => {
  assert.ok(coutJetons(50) > PRIX.pack_debutant && coutJetons(50) < 30);
});
