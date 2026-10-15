export function resolveNewGameRequest({ hasStoredSave, confirmed }) {
  return hasStoredSave && !confirmed ? 'keep-save' : 'choose-nation';
}
