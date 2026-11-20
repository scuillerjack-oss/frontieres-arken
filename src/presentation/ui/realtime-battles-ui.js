// Interface — V17.2 : batailles en cours et bombardements permanents ; V17.3 : branchés dans l'interface temps réel.
// Un ⚔ « n/3 » sur chaque province en bataille (couche #rtBattles dans #mapWorld, copies comprises). Le toucher ouvre la fiche de la bataille : « Assaut 2/3 », date du prochain assaut, camps et PV, bouton « Retraite » pour le
// joueur qui attaque ; le défenseur est prévenu que ses troupes sont bloquées. Les affrontements sont publics (V10).

import { battleSummary, cancelBombardOrder, formatDate, formatShortDate, retreatFromBattle } from '../../domain/game-engine.js';
import { arkenV9Map as map } from '../../map/arken-v9-map.js';
import { $, E, nation, province, toast } from './base.js';
import { actionModal } from './province-sheet.js';
import { state } from './session.js';

const name = id => id ? nation(id).short : 'Île neutre';

let after = () => {};
/** realtime-ui.js donne ce qu'il faut faire après une retraite (redessiner, sauvegarder). */
export const setBattleRefresh = fn => { after = fn; };
/**
 * V17.3 : ⚔ « n/3 » sur chaque province en bataille, en couche (#rtBattles) DANS #mapWorld (map-view.js) : les copies <use>
 * du défilement sans fin la répètent. Taille lisible à tout zoom (ui-scale), touchable → fiche de la bataille.
 */
export function battlesLayer() {
  const layer = E('g', { id: 'rtBattles', class: 'rt-battles' });
  for (const b of state.battles || []) {
    const s = battleSummary(state, b), a = province(b.provinceId).markerAnchor;
    const mine = b.defenderId === state.playerNationId || b.attackers.some(e => e.nationId === state.playerNationId);
    const g = E('g', { class: `rt-battle${mine ? ' mine' : ''}`, 'data-battle': b.id, role: 'button', tabindex: '0', transform: `translate(${Math.round(a.x)} ${Math.round(a.y)})`,
      'aria-label': `Bataille de ${province(b.provinceId).name}, assaut ${s.assaultsDone} sur ${s.assaults}` });
    const inner = E('g', { class: 'ui-scale' }), pos = E('g', { transform: 'translate(44 -18)' });
    pos.append(E('circle', { r: 27, class: 'battle-disc' }));
    const icon = E('text', { y: 2, class: 'battle-icon' }); icon.textContent = '⚔';
    const count = E('text', { y: 44, class: 'battle-count' }); count.textContent = `${s.assaultsDone}/${s.assaults}`;
    pos.append(icon, count); inner.append(pos); g.append(inner);
    const open = event => { event.stopPropagation(); openBattle(b.id); };
    g.addEventListener('click', open);
    g.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(event); } });
    layer.append(g);
  }
  return layer;
}
/** Fiche d'une bataille : assaut en cours, prochain assaut, camps, PV, « Retraite ». */
export function openBattle(id, refresh = after) {
  const b = (state.battles || []).find(x => x.id === id);
  if (!b) { toast('La bataille est terminée'); return; }
  const s = battleSummary(state, b), me = state.playerNationId, attacking = b.attackers.some(e => e.nationId === me), defending = b.defenderId === me;
  const rows = s.attackers.map(a => `<span>⚔ ${name(a.nationId)}${a.mode === 'landing' ? ' (débarquement)' : ''} : ${a.nationId === me || defending ? `${a.units} unités · ${a.hp} PV` : 'à l’assaut'}</span>`).join('');
  actionModal(`Bataille de ${province(b.provinceId).name}`, `ASSAUT ${s.assaultsDone}/${s.assaults} · ${formatShortDate(state.day)}`,
    `<div class="order-detail" id="rtBattleSheet"><span><b>Assaut ${s.assaultsDone}/${s.assaults}</b> joué · ${s.assaultsDone < s.assaults ? `assaut ${s.nextAssault}/${s.assaults} le ${formatDate(s.nextAssaultDate)}` : 'dernier assaut joué'}</span>
<span>🛡 ${name(b.defenderId)} défend${defending || attacking ? ` : ${s.defenderHp} PV` : ''}</span>${rows}
<span>Début : ${formatDate(s.startDate)} · 3 assauts au plus, tous les 3 jours. Les renforts qui arrivent rejoignent le prochain assaut.</span>
${defending ? '<span>Vos troupes de cette province sont bloquées tant que la bataille dure.</span>' : ''}</div>${attacking ? '<button id="rtRetreat" class="primary">Retraite</button>' : ''}`);
  const r = $('#rtRetreat');
  if (r) r.onclick = () => { const x = retreatFromBattle(state, map, { nationId: me, battleId: b.id }); $('#actionDialog').close(); toast(x.ok ? `Retraite : retour le ${formatDate(x.arriveDay)}` : x.error); refresh(); };
}
/** Ligne du bandeau : la bataille du joueur la plus proche de son prochain assaut. */
export function battleNews() {
  const me = state.playerNationId;
  const b = [...(state.battles || [])].filter(x => x.defenderId === me || x.attackers.some(e => e.nationId === me)).sort((x, y) => x.nextAssaultDay - y.nextAssaultDay)[0];
  if (!b) return '';
  const s = battleSummary(state, b);
  return `Bataille de ${province(b.provinceId).name} : assaut ${s.assaultsDone}/${s.assaults}${s.assaultsDone < s.assaults ? ` · prochain le ${formatShortDate(s.nextAssaultDate)}` : ''} · touchez ⚔ sur la carte`;
}
/** Lignes « bombardement permanent » de la liste des troupes (avec « Arrêter »). */
export function bombardRows() {
  return (state.bombardOrders || []).filter(o => o.nationId === state.playerNationId).map(o => `<div class="unit-row"><span>💣 ${province(o.fromId).name} bombarde ${province(o.toId).name} · ${o.warships} navire${o.warships > 1 ? 's' : ''} · tous les 10 jours</span><button data-stop-bombard="${o.id}">Arrêter</button></div>`).join('');
}
export function wireBombardRows(again) {
  document.querySelectorAll('[data-stop-bombard]').forEach(b => b.onclick = () => { const r = cancelBombardOrder(state, { nationId: state.playerNationId, orderId: b.dataset.stopBombard }); toast(r.ok ? 'Bombardement arrêté' : r.error); again(); });
}
