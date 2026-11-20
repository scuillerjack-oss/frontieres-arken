// Interface — V17.2 : batailles en cours et bombardements permanents, écran PROVISOIRE (l'interface complète est la V17.3).
// Un ⚔ sur chaque province en bataille (calque à part #rtBattles, comme les marches : map-view.js n'est pas touché). Le
// toucher ouvre la fiche de la bataille : « Assaut 2/3 », date du prochain assaut, camps et PV, bouton « Retraite » pour le
// joueur qui attaque ; le défenseur est prévenu que ses troupes sont bloquées. Les affrontements sont publics (V10).

import { battleSummary, cancelBombardOrder, formatDate, formatShortDate, retreatFromBattle } from '../../domain/game-engine.js';
import { arkenV9Map as map } from '../../map/arken-v9-map.js';
import { $, E, nation, province, toast } from './base.js';
import { actionModal } from './province-sheet.js';
import { state } from './session.js';

const name = id => id ? nation(id).short : 'Île neutre';

/** ⚔ sur les provinces en bataille, avec « n/3 » (assauts joués). */
export function drawBattles(onOpen) {
  const svg = $('#map');
  if (!svg) return;
  svg.querySelector('#rtBattles')?.remove();
  const layer = E('g', { id: 'rtBattles', class: 'rt-battles' });
  for (const b of state.battles || []) {
    const s = battleSummary(state, b), a = province(b.provinceId).markerAnchor;
    const mine = b.defenderId === state.playerNationId || b.attackers.some(e => e.nationId === state.playerNationId);
    const g = E('g', { class: `rt-battle${mine ? ' mine' : ''}`, 'data-battle': b.id, role: 'button', tabindex: '0', transform: `translate(${Math.round(a.x)} ${Math.round(a.y - 46)})`,
      'aria-label': `Bataille de ${province(b.provinceId).name}, assaut ${s.assaultsDone} sur ${s.assaults}` });
    g.append(E('circle', { r: 30, fill: '#7a1010', stroke: mine ? '#ffd84a' : '#fff7df', 'stroke-width': 6 }));
    const icon = E('text', { y: 4, 'text-anchor': 'middle', 'font-size': 28, fill: '#fff' }); icon.textContent = '⚔';
    const count = E('text', { y: 54, 'text-anchor': 'middle', 'font-size': 24, 'font-weight': 700, fill: '#fff7df', stroke: '#3a0606', 'stroke-width': 5, 'paint-order': 'stroke' });
    count.textContent = `${s.assaultsDone}/${s.assaults}`;
    g.append(icon, count);
    g.addEventListener('click', event => { event.stopPropagation(); openBattle(b.id, onOpen); });
    layer.append(g);
  }
  svg.append(layer);
}
/** Fiche d'une bataille : assaut en cours, prochain assaut, camps, PV, « Retraite ». */
export function openBattle(id, refresh = () => {}) {
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
  return `⚔ Bataille de ${province(b.provinceId).name} : assaut ${s.assaultsDone}/${s.assaults}${s.assaultsDone < s.assaults ? ` · prochain le ${formatShortDate(s.nextAssaultDate)}` : ''} · touchez ⚔`;
}
/** Lignes « bombardement permanent » de la liste des troupes (avec « Arrêter »). */
export function bombardRows() {
  return (state.bombardOrders || []).filter(o => o.nationId === state.playerNationId).map(o => `<div class="unit-row"><span>💣 ${province(o.fromId).name} bombarde ${province(o.toId).name} · ${o.warships} navire${o.warships > 1 ? 's' : ''} · tous les 10 jours</span><button data-stop-bombard="${o.id}">Arrêter</button></div>`).join('');
}
export function wireBombardRows(again) {
  document.querySelectorAll('[data-stop-bombard]').forEach(b => b.onclick = () => { const r = cancelBombardOrder(state, { nationId: state.playerNationId, orderId: b.dataset.stopBombard }); toast(r.ok ? 'Bombardement arrêté' : r.error); again(); });
}
