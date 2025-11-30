/**
 * Network utilities for IP detection and QR code generation
 */

import { networkInterfaces } from 'os';
import QRCode from 'qrcode';
import { logger } from './logger';

const networkLogger = logger.child({ module: 'Network' });

/**
 * Get the local network IP address (WiFi/LAN)
 * Returns the first non-internal IPv4 address found
 */
export function getLocalNetworkIP(): string {
  const interfaces = networkInterfaces();

  for (const name of Object.keys(interfaces)) {
    const nets = interfaces[name];
    if (!nets) continue;

    for (const net of nets) {
      // Skip internal (loopback) and non-IPv4 addresses
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }

  // Fallback to localhost if no network interface found
  return 'localhost';
}

/**
 * Generate a QR code as a data URL
 * @param url - The URL to encode in the QR code
 * @returns Promise<string> - Data URL of the QR code image
 */
export async function generateQRCodeDataURL(url: string): Promise<string> {
  try {
    // Generate QR code as data URL with high error correction
    const dataUrl = await QRCode.toDataURL(url, {
      errorCorrectionLevel: 'H',
      type: 'image/png',
      width: 400,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#FFFFFF',
      },
    });

    return dataUrl;
  } catch (err) {
    networkLogger.error('Failed to generate QR code', err);
    // Return a placeholder on error
    return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  }
}

/**
 * Get the base URL for the client application
 * Uses PUBLIC_URL in production, falls back to local IP for development
 */
export function getClientBaseUrl(localIP?: string): string {
  const publicUrl = process.env.PUBLIC_URL;
  if (publicUrl) {
    return publicUrl.replace(/\/$/, ''); // Remove trailing slash
  }
  // Development: use local IP
  const ip = localIP || getLocalNetworkIP();
  const port = process.env.CLIENT_PORT || 5173;
  return `http://${ip}:${port}`;
}

/**
 * Generate a room join URL
 * @param roomId - The room UUID
 * @param localIP - The local network IP address (used only in dev when PUBLIC_URL not set)
 * @returns The complete join URL
 */
export function generateRoomJoinURL(roomId: string, localIP?: string): string {
  const baseUrl = getClientBaseUrl(localIP);
  return `${baseUrl}/room/${roomId}`;
}
