/**
 * Utilitaires de Résolution de Paramètres
 *
 * Ce fichier fournit des fonctions pour résoudre les paramètres du jeu
 * en suivant la chaîne d'héritage :
 * 1. Paramètres du round (priorité la plus haute)
 * 2. Valeurs par défaut du mode de jeu
 * 3. Valeurs par défaut du système (fallback)
 *
 * Utilise l'opérateur ?? (nullish coalescing) pour gérer correctement
 * les valeurs falsy mais valides (false, 0, "")
 */

import type { Round, ModeParams } from '@blind-test/shared';
import type { ModeHandler } from '../modes/types';
import { SYSTEM_DEFAULTS } from '@blind-test/shared';

/**
 * Résout un paramètre unique en suivant la chaîne d'héritage
 *
 * @param paramName - Nom du paramètre à résoudre (ex: 'songDuration', 'manualValidation')
 * @param round - Le round actuel (peut avoir des surcharges de paramètres)
 * @param modeHandler - Le gestionnaire de mode (a des paramètres par défaut)
 * @returns La valeur du paramètre résolue
 *
 * @example
 * ```typescript
 * const duration = resolveParam('songDuration', round, modeHandler);
 * // Retourne: round.params.songDuration ?? modeHandler.defaultParams.songDuration ?? SYSTEM_DEFAULTS.songDuration
 * ```
 */
export function resolveParam<K extends keyof ModeParams>(
  paramName: K,
  round: Round,
  modeHandler: ModeHandler
): NonNullable<ModeParams[K]> {
  return (
    round.params?.[paramName] ??
    modeHandler.defaultParams[paramName] ??
    SYSTEM_DEFAULTS[paramName]
  ) as NonNullable<ModeParams[K]>;
}

/**
 * Méthodes de convenance pour résoudre les paramètres les plus courants
 *
 * Ces fonctions sont des raccourcis pour résoudre des paramètres spécifiques
 * sans avoir à passer le nom du paramètre comme chaîne de caractères.
 */

/** Durée de lecture de la chanson en secondes */
export function getSongDuration(round: Round, modeHandler: ModeHandler): number {
  return resolveParam('songDuration', round, modeHandler);
}

/** Timer de réponse en secondes */
export function getAnswerTimer(round: Round, modeHandler: ModeHandler): number {
  return resolveParam('answerTimer', round, modeHandler);
}

/** Validation manuelle activée ou non */
export function getManualValidation(round: Round, modeHandler: ModeHandler): boolean {
  return resolveParam('manualValidation', round, modeHandler);
}

/** Points pour le titre */
export function getPointsTitle(round: Round, modeHandler: ModeHandler): number {
  return resolveParam('pointsTitle', round, modeHandler);
}

/** Points pour l'artiste */
export function getPointsArtist(round: Round, modeHandler: ModeHandler): number {
  return resolveParam('pointsArtist', round, modeHandler);
}

/** Nombre de choix dans les questions à choix multiples */
export function getNumChoices(round: Round, modeHandler: ModeHandler): number {
  return resolveParam('numChoices', round, modeHandler);
}

/** Matching flou activé ou non */
export function getFuzzyMatch(round: Round, modeHandler: ModeHandler): boolean {
  return resolveParam('fuzzyMatch', round, modeHandler);
}

/** Distance de Levenshtein maximale pour le matching flou */
export function getLevenshteinDistance(round: Round, modeHandler: ModeHandler): number {
  return resolveParam('levenshteinDistance', round, modeHandler);
}

/** Pénalités activées ou non */
export function getPenaltyEnabled(round: Round, modeHandler: ModeHandler): boolean {
  return resolveParam('penaltyEnabled', round, modeHandler);
}

/** Montant de la pénalité */
export function getPenaltyAmount(round: Round, modeHandler: ModeHandler): number {
  return resolveParam('penaltyAmount', round, modeHandler);
}

/** Autoriser le re-buzz ou non */
export function getAllowRebuzz(round: Round, modeHandler: ModeHandler): boolean {
  return resolveParam('allowRebuzz', round, modeHandler);
}

/** Où l'audio est joué ('master', 'players', ou 'all') */
export function getAudioPlayback(round: Round, modeHandler: ModeHandler): 'master' | 'players' | 'all' {
  return resolveParam('audioPlayback', round, modeHandler) as 'master' | 'players' | 'all';
}
