# Clé de signature des APK de BÊTA — PUBLIQUE, NON SECRÈTE

`arken-debug.keystore` est une **clé de débogage** (alias `arkendebug`, mots de passe `android`,
valable 30 ans). Elle est **volontairement commitée et publique** : elle ne protège rien.

Elle sert **UNIQUEMENT** à signer les APK de bêta fabriqués par `.github/workflows/android-apk.yml`.
Toujours la même signature d'un build à l'autre = Android accepte d'installer chaque nouvelle
bêta **par-dessus** la précédente, sans désinstaller, donc **sans perdre les parties**.

- Ne jamais la remplacer ni la régénérer : la bêta suivante refuserait de s'installer
  par-dessus (il faudrait désinstaller l'appli et les parties seraient perdues).
- Ne jamais l'utiliser pour Google Play.

La **vraie clé Google Play** sera générée en **V12**. Elle restera dans les **secrets GitHub**,
jamais dans ce dépôt.
