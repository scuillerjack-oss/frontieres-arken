// V17.1 — Toutes les valeurs du temps réel (docs/V17-cahier-des-charges.md). Les équipes V17.2 à V17.10 ne font que les
// LIRE (RULES.realtime, branché dans constants.js) : changer un chiffre ne demande pas de code. Module pur, sans import.
//
// Deux conversions seulement (§2.1) : un « tour de délai » = 30 jours ; un « tour d'économie » (revenus) = 60 jours.
// Le compteur `state.turn` d'une partie temps réel devient la PÉRIODE de 30 jours en cours (§2.2, Technique) : toutes les
// mémoires et délais exprimés en tours dans le moteur se convertissent donc tout seuls. Ne sont écrites en jours ici que
// les durées d'action et les rythmes.

const freezeDeep = o => { for (const v of Object.values(o)) if (v && typeof v === 'object') freezeDeep(v); return Object.freeze(o); };

export const REALTIME_RULES = freezeDeep({
  // §1 Le temps
  clock: {
    msPerDay: 2000,          // 1 jour = 2 s en ×1
    fastMsPerDay: 1000,      // ×2 (Premium) : 1 s par jour
    tickMs: 250,             // l'interface compte le temps écoulé tous les 250 ms
    maxDaysPerTick: 4        // au plus 4 jours rattrapés d'un coup (téléphone lent)
  },
  // §1.2 Date : jour 1 = 1er janvier 2027 (une seule constante à décaler si la sortie glisse)
  startDate: Object.freeze({ year: 2027, month: 1, day: 1 }),
  // §1.3 Durée : 15 ans (fin le 31/12/2041) ; partie courte 7 ans (fin le 31/12/2033)
  gameDays: { normal: 5479, short: 2557 },
  // Longueur en périodes de 30 jours (gameLengthOf d'une partie temps réel : scaleTurn étire les seuils de phase)
  gamePeriods: { normal: 183, short: 86 },
  // Alertes de fin (§1.3) : en années / mois avant la fin (date calculée par clock.js)
  endAlerts: { normal: [{ id: 'year', months: 12 }, { id: 'month', days: 30 }], short: [{ id: 'half-year', months: 6 }, { id: 'month', days: 30 }] },
  // §2 Conversion
  daysPerPeriod: 30,         // 1 « tour de délai » = 30 jours ; state.turn = période en cours
  incomeDays: 60,            // 1 « tour d'économie » = 60 jours : revenu par jour = revenu par tour ÷ 60 (report exact, §3.1)
  phaseReferenceTurns: 80,   // seuils de phase écrits pour une partie de 80 tours (jour = tour × 5 479 ÷ 80)
  // §2.2 Durées d'action (jours)
  durations: {
    units: { infantry: 30, cavalry: 30, armor: 60, artillery: 60, warship: 90 },
    buildings: { bank: 90, factory: 90, port: 90, fort: 60, farm: 60 },
    balloon: 60,             // construction d'un ballon
    balloonHop: 60,          // un saut d'île en île
    land: 30,                // province voisine par la terre
    cavalryLand: 20,         // armée composée uniquement de cavalerie
    sea: 60,                 // mer, entre deux nations (anneau)
    islandSea: 120,          // vers / depuis l'île mystérieuse
    interceptDaysLeft: 30,   // interception par le port d'arrivée quand il reste 30 jours de traversée
    landPerSeaTurn: 30       // conversion des durées maritimes « en tours » de la carte (2 tours = 60 j, 4 = 120 j)
  },
  // §3 Économie (coûts inchangés) : revenus « par mois » affichés = revenu par tour ÷ 2
  income: { perMonth: { province: 2, bank: 2.5, factory: 1.5, port: 1, islandBank: 5 }, recapEveryDays: 30 },
  // §4 Nourriture (V17.4) — tout en centièmes de vivre dans le moteur
  food: {
    hundredths: 100, provinceDaily: 8, islandDaily: 0, farmDaily: 10, farmMax: 5, farmCosts: [20, 25, 30, 35, 40], farmDays: 60,
    goldPerRation: 20, startReserve: 900, granaryDays: 180, alertDays: 10, alertRepeatDays: 30,
    famineFireFactor: .7, famineDesertPct: 1, noFaminePointDays: 50,
    aiTargetMargin: 1.1, aiGoldReserve: 10, aiReserveDays: 15
  },
  // §5 Combats (V17.2)
  battle: {
    assaults: 3, assaultEveryDays: 3, maxDays: 6, noHealDays: 10,
    retreatLandDays: 30,     // repli par la terre (30 j, 20 j pour la cavalerie seule : durations.cavalryLand)
    meetSameDirectionDays: 1 // deux convois ennemis dans le même sens à moins d'un jour l'un de l'autre se rencontrent
  },
  // §2.2 Guérison, réparations, bombardement (V17.2)
  recovery: { healEveryDays: 10, healPctPer30: 10, shipRepairDays: [90, 120, 150], fieldRepairPctPer30: 5 },
  bombard: { everyDays: 10, breachPerShip: 4, maxPerTick: 10, repairEveryDays: 30, repairAmount: 10 },
  // §2.2 Délais diplomatiques et mémoires (en jours ; dans le moteur : tours × 30 via state.turn)
  diplomacy: {
    truceBetrayalDays: 300, proposalDays: 180, pendingDays: 180, helpDays: 150, stationMinDays: 150,
    provocationDays: 240, charmDays: 360, refusalDays: 600, heroMemoryDays: 150,
    traitorStrikeDays: [90, 210], traitorExtraMaxDays: 150, traitorWarDays: 180, easyWarDelayDays: 240,
    easyAttackEveryDays: 30, aiAnswerMaxDays: 10
  },
  // §7 IA : une décision complète tous les 10 jours par nation, décalées de 2 jours ((jour + 2 i) % 10 = 0)
  // V17.5 : l'IA raisonne en jours. Une règle « par tour » du tour par tour s'applique au plus une fois par fenêtre
  // (`pace`, en jours) au lieu d'une fois par décision (3 décisions par période) : recrutements, navires, débarquements,
  // attaques terrestres (quota ARCH_ATTACKS × attacksPerPace par fenêtre ; Facile : une seule par fenêtre, cahier §2.2).
  ai: {
    decisionEveryDays: 10, offsetDays: 2, talkEveryDays: 30, slowDayMs: 200,
    pace: { recruit: 30, ship: 30, landing: 30, attack: 30 },
    attacksPerPace: 1,
    marginAdd: -.1,          // correction de la marge d'attaque de l'IA en temps réel (équilibre, mesuré : §15 V17.5)
    balloonReserve: 20,      // or gardé après l'achat d'un ballon (tour par tour : RULES.balloon.aiReserve = 60)
    recallMargin: .6,        // une attaque en route est rappelée si la simulation (garnison vue × marge) dit qu'elle échoue
    reinforceShares: [.35, .5, .7], // parts des troupes d'une province voisine envoyées défendre une province menacée
    emergencyRecruit: true,  // menacée sans voisin qui puisse aider : un lot de fantassins sur place s'il arrive à temps
    // V17.5b (Jack : personnalités plus vivantes, jamais la même partie) : realtime/personalities.js, engine/ai.js.
    // jitter : variation (±) des seuils de chaque dirigeant, tirée à la graine de la partie. Périodes = 30 jours.
    personality: {
      jitter: .12,
      conquerant: { margin: .9, warMargin: .78, attacks: 3, extraLots: 1, recruitPace: 20, landingPace: 20, landingWarFloor: 1, startPeriods: [1, 3], truceBreakPeriods: [4, 8], preyPeriods: [3, 8], secondPrey: 1.1 },
      heros: { menaceVictims: 2, menaceMemory: 12, coalitionChance: .6, strikeMenaceStrength: .5 },
      traitre: { opportunityChance: .3, opportunityRatio: .8, courtChance: .35, courtFromPeriod: [5, 10], busyRatio: .85, calmRatio: .6, maxAllies: 2, restPeriods: [36, 66] },
      batisseur: { allyChance: .35, maxAllies: 2, fortMax: 2, farmsPerProvince: 2, reserve: 20 }
    }
  },
  // §7 Rythmes du monde
  world: { coalitionEveryDays: 10, eliminationEveryDays: 10, tensionEveryDays: 30, balloonReportEveryDays: 30 },
  // §2.2 Phases de partie (jours) — repères ; le moteur passe par scaleTurn (périodes)
  phases: { coalitionDay: 685, lateDay: 3081, builderRevealDay: 1370, traitorCourtDay: 685, builderHeroDay: 411 },
  // §2.2 Garnison estimée : × (1 + 2,37 × jour ÷ 5 479)
  vision: { growthAtEnd: 2.37, referenceDays: 5479 },
  // §9 Fin de partie et classement (V17.8)
  ranking: { province: 100, capital: 150, troopGoldPerPoint: 20, treasuryGoldPerPoint: 20, noFamineDaysPerPoint: 50, refreshEveryDays: 10 },
  end: { peaceDays: 90, reofferDays: 180 },
  // §10 Pubs et Premium (V17.7)
  ads: { rewardedMinMinutes: 5, rewardedMaxMinutes: 10, forcedEveryMinutes: 10, rewardMinGold: 10, rewardRoundTo: 5 },
  premium: { priceEur: 1.99, starterPackEur: 2.99, starterPackTokens: 3 },
  // §11 Sauvegarde
  save: { everyDays: 10, minIntervalMs: 1000, schema: 13 }
});
