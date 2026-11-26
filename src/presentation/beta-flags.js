// V17.13 — Drapeaux des BÊTAS INTERNES : un seul endroit, un seul interrupteur par sujet.
//
// ┌──────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
// │ BETA_X2_GRATUIT : vitesse ×2 (⏩) GRATUITE pour les testeurs des bêtas internes (demande de Jack du 26/11/2026).   │
// │   true  = bêta interne : ⏩ marche pour tout le monde, sans achat ni écran Premium.                                │
// │   false = PRODUCTION : ⏩ redevient réservé au Premium (logique V17.7 inchangée, rien d'autre à toucher).          │
// │ ⚠ À REMETTRE À false AVANT LA PRODUCTION (docs/SORTIE-ARKEN.md, docs/GUIDE-GOOGLE-PLAY-TEST-INTERNE.md).          │
// └──────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
// Aucun paiement n'est activé par ce drapeau : il ne fait qu'ouvrir ⏩ sans Premium. Premium garde ses autres avantages
// (plus de pub imposée) et son écran reste accessible depuis les Atouts.
export const BETA_X2_GRATUIT = true;

/** ⏩ ×2 accessible ? Premium, ou bêta interne avec BETA_X2_GRATUIT. `free` : pour les tests (par défaut le drapeau). */
export const fastSpeedUnlocked = (profile, free = BETA_X2_GRATUIT) => free === true || profile?.premium === true;
