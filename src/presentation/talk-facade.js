// V11 — façade entre l'interface et le moteur des personnalités (docs/V11-contrat.md).
// Le contrat ne fixe pas dans quel module (talk.js ou leaders.js) vit chaque fonction : on les cherche dans les deux.
import * as talkModule from '../domain/talk.js';
import * as leadersModule from '../domain/leaders.js';

const pick = name => {
  const fn = talkModule[name] || leadersModule[name];
  if (typeof fn !== 'function') throw new Error(`Moteur V11 : fonction ${name} absente`);
  return fn;
};
export const talkOptions = (state, map, args) => pick('talkOptions')(state, map, args);
export const queueTalk = (state, map, args) => pick('queueTalk')(state, map, args);
export const tensionLevel = (state, a, b) => pick('tensionLevel')(state, a, b);
export const leaderHint = (state, nationId) => pick('leaderHint')(state, nationId);
