// Point d'entrée du moteur : réexporte l'API publique, découpée par thème dans src/domain/engine/ (V15.0).
// Aucun DOM ici ni dans engine/ : tout se teste sous Node.

export { resolveBattle, resolveCombat, provinceForce, combatValue } from './combat.js';
export { visibleProvinces, provinceIntel, perceivedForce, perceivedStrength, prudentEstimate, visionSharers } from './vision.js';
export { hasPassage, stationedAt, stationedForce, guestsAt, stationedOf, garrisonForce, PASSAGE_TEXT } from './passage.js';
export { adviserText, spendableTreasury } from './engine/shared.js';
export { buildingIncome, incomeBreakdown, incomeFor, landPower, navalPower } from './engine/income.js';
export {
  embarkStatus, isPortPoint, landingCoast, legalDestinations, seaMoveRefusal, seaRoutesFrom, seaTravelTurns
} from './engine/sea-routes.js';
export {
  FORT_IN_PROGRESS, availableForces, buildingCount, moveForce, queueConstruction, queueMoveOrder, queueRecruitment
} from './engine/orders.js';
export {
  CEASEFIRE_PROPOSAL_BONUS, TRUCE_BETRAYAL_TURNS, activeProposal, aiCeasefireGold, ceasefireChance,
  maxCeasefireDemand, proposalsToAnswer, queueDiplomaticOrder, recentTruce, recordDiplomaticAction, refusalsOf,
  respondToProposal, setRelation, truceBreakStatus
} from './engine/diplomacy.js';
export {
  BALLOON_ORDER_KINDS, balloonBuildStatus, balloonById, balloonDestinations, balloonMax, balloonPath, balloonReport,
  balloonSeenProvinces, balloonShootStatus, balloonViewers, balloonsInConstruction, balloonsOf, cancelBalloonOrder,
  foreignBalloonsOver, islandNeighbors, islandProvinces, pendingBalloonOrders, queueBalloonBuild, queueBalloonSend,
  queueBalloonShoot, visibleBalloons
} from './engine/balloons.js';
export { bombardPreview, bombardStatus, bombardTargets, fortBreach, queueBombard } from './engine/bombard.js';
export { SHIP_FIELD_REPAIR, SHIP_REPAIR_TURNS, shipRepairInfo, shipRepairTurnsFor } from './engine/recovery.js';
export { NAVAL_IDLE_CAP, NAVAL_STRIKE_MARGIN } from './engine/ai-naval.js';
export { STATION_MIN_TURNS } from './engine/ai-help.js';
export { coalitionTargetFor, dominantNation, joinsCoalition, updateCoalition } from './engine/coalition.js';
export { GARRISON_MEMORY_TURNS, planAIOrders, rememberedGarrison } from './engine/ai.js';
export {
  buildPermanentJournal, buildTurnJournal, eventInvolvesNation, eventKnownToPlayer, journalEntry
} from './engine/journal.js';
export { capitalsVictor, checkGameOver, gameRanking, nextTurn, resolveInterturn } from './engine/turn.js';


// V17.1 : temps réel (src/domain/realtime/, docs/V17-cahier-des-charges.md).
export { advanceDay, advanceDays, executePendingOrders } from './realtime/day.js';
export {
  aiNationOfDay, dateOfDay, dayOfDate, endAlertDays, formatDate, formatShortDate, gameDaysOf, gamePeriodsOf, isRealtime, periodOfDay
} from './realtime/clock.js';
export { landTravelDays, recallConvoy, recallMarch } from './realtime/marches.js';
export { createRealtimeGame } from './realtime/create.js';
