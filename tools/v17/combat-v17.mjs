// V17.0 — Vérifie qu'une bataille découpée en assauts d'un jour (resolveBattle à 1 passe, rejoué sur les survivants) donne
// EXACTEMENT le même résultat qu'une bataille de 3 passes du moteur actuel. C'est la base du combat en temps réel (§5).
//   node tools/v17/combat-v17.mjs
import { resolveBattle, normalizeForce, totalHp } from '../../src/domain/combat.js';

const cases = [];
for (let i = 0; i < 400; i++) {
  const n = k => (i * 37 + k * 101) % 97;
  cases.push({
    defender: normalizeForce({ units: { infantry: 20 + n(1) * 6, cavalry: n(2) % 12, armor: n(3) % 9, artillery: n(4) % 4, warship: i % 7 === 0 ? 1 : 0 } }),
    attacker: normalizeForce({ units: { infantry: 30 + n(5) * 7, cavalry: n(6) % 15, armor: n(7) % 14, artillery: n(8) % 5 } }),
    fortLevel: i % 4, mode: i % 5 === 0 ? 'landing' : 'land'
  });
}
let identical = 0, differ = [];
for (const [i, c] of cases.entries()) {
  const whole = resolveBattle({ defender: c.defender, attackers: [{ id: 'a', force: c.attacker, mode: c.mode }], fortLevel: c.fortLevel });
  let d = c.defender, a = c.attacker, captured = false, winnerId = null;
  for (let p = 0; p < 3 && !captured; p++) {
    if (totalHp(d) <= 0 || totalHp(a) <= 0) break;
    const r = resolveBattle({ defender: d, attackers: [{ id: 'a', force: a, mode: c.mode }], fortLevel: c.fortLevel, passes: 1 });
    d = r.defender; a = r.attackers[0].force; captured = r.captured; winnerId = r.winnerId;
  }
  const same = JSON.stringify([whole.defender, whole.attackers[0].force, whole.captured, whole.winnerId]) === JSON.stringify([d, a, captured, winnerId]);
  if (same) identical++; else differ.push(i);
}
console.log(JSON.stringify({ batailles: cases.length, identiques: identical, differentes: differ.length, exemples: differ.slice(0, 5) }));
