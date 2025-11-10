/**
 * Authentication Service
 * Handles token generation and validation for room masters and players
 */

import { generateId } from '@blind-test/shared';

export class AuthService {
  /**
   * Generate a secure random token
   */
  static generateToken(): string {
    return generateId(); // Using UUID as secure token
  }

  /**
   * Validate master token for a room
   * @param providedToken Token provided by client
   * @param roomMasterToken Actual master token from database
   * @returns true if tokens match
   */
  static validateMasterToken(providedToken: string | undefined, roomMasterToken: string): boolean {
    if (!providedToken) return false;
    return providedToken === roomMasterToken;
  }

  /**
   * Validate player token
   * @param providedToken Token provided by client
   * @param playerToken Actual player token from database
   * @returns true if tokens match
   */
  static validatePlayerToken(providedToken: string | undefined, playerToken: string): boolean {
    if (!providedToken) return false;
    return providedToken === playerToken;
  }
}

export const authService = new AuthService();
