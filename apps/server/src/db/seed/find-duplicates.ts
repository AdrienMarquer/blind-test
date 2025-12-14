/**
 * Find Duplicates Script
 *
 * Detects and optionally removes duplicate songs from the database.
 *
 * Usage:
 *   bun run apps/server/src/db/seed/find-duplicates.ts
 *   bun run apps/server/src/db/seed/find-duplicates.ts --delete
 *   bun run apps/server/src/db/seed/find-duplicates.ts --interactive
 *   bun run apps/server/src/db/seed/find-duplicates.ts --export=duplicates.json
 *
 * Options:
 *   --delete         Delete duplicates automatically (keeps best metadata)
 *   --interactive    Ask for confirmation before each deletion
 *   --export=FILE    Export duplicate list to JSON file
 */

import { db, schema } from "../index";
import { eq } from "drizzle-orm";
import fs from "fs/promises";
import path from "path";
import readline from "readline";

// Server root directory
const SERVER_ROOT = path.join(__dirname, "..", "..", "..");

// Musiques.json path
const MUSIQUES_JSON_PATH = path.join(__dirname, "musiques.json");

// Types
interface Song {
  id: string;
  title: string;
  artist: string;
  album: string | null;
  year: number;
  genre: string | null;
  spotifyId: string | null;
  albumArt: string | null;
  filePath: string | null;
  createdAt: string | null;
}

interface DuplicateGroup {
  type: "exact" | "variation";
  baseTitle: string;
  artist: string;
  songs: Song[];
  toDelete: Song[];
  toKeep: Song;
}

// ============================================================================
// Normalization Functions
// ============================================================================

/**
 * Normalize a title for comparison by removing common variations
 * Preserves track numbers (Part. X, Pt. X, etc.)
 */
function normalizeTitle(title: string): string {
  return (
    title
      .toLowerCase()
      // Remove remastered suffixes
      .replace(/\s*[-–]\s*\d{4}\s*remaster(ed)?.*$/i, "")
      .replace(/\s*[-–]\s*remaster(ed)?.*$/i, "")
      .replace(/\s*\(remaster(ed)?[^)]*\)/gi, "")
      .replace(/\s*\[remaster(ed)?[^\]]*\]/gi, "")
      // Remove live versions
      .replace(/\s*\(live[^)]*\)/gi, "")
      .replace(/\s*\[live[^\]]*\]/gi, "")
      .replace(/\s*[-–]\s*live.*$/i, "")
      // Remove radio/single versions
      .replace(/\s*\(radio[^)]*\)/gi, "")
      .replace(/\s*\(single[^)]*\)/gi, "")
      .replace(/\s*[-–]\s*radio.*$/i, "")
      .replace(/\s*[-–]\s*single.*$/i, "")
      // Remove featuring artists (but preserve song title structure)
      .replace(/\s*\(feat\.?[^)]*\)/gi, "")
      .replace(/\s*\[feat\.?[^\]]*\]/gi, "")
      .replace(/\s*\(with\s[^)]*\)/gi, "")
      // Remove year annotations (standalone years in parens)
      .replace(/\s*\(\d{4}\)/gi, "")
      .replace(/\s*\[\d{4}\]/gi, "")
      // Remove version annotations
      .replace(/\s*\(version[^)]*\)/gi, "")
      .replace(/\s*\(original[^)]*\)/gi, "")
      .replace(/\s*\(extended[^)]*\)/gi, "")
      .replace(/\s*\(remix[^)]*\)/gi, "")
      .replace(/\s*\(edit[^)]*\)/gi, "")
      // Remove bonus/deluxe annotations
      .replace(/\s*\(bonus[^)]*\)/gi, "")
      .replace(/\s*\(deluxe[^)]*\)/gi, "")
      // Standardize "Part" / "Pt" notation to keep track numbers
      .replace(/\bpart\.?\s*/gi, "pt")
      .replace(/\bpt\.?\s*/gi, "pt")
      // Remove remaining brackets BUT preserve content with numbers (like "Pt. 7")
      .replace(/\s*\((?![^)]*\d)[^)]*\)/g, "")
      .replace(/\s*\[(?![^\]]*\d)[^\]]*\]/g, "")
      // Clean up
      .replace(/\s+/g, " ")
      .trim()
  );
}

/**
 * Normalize artist name for comparison
 */
function normalizeArtist(artist: string): string {
  return artist
    .toLowerCase()
    .replace(/\s*&\s*/g, " and ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1, // insertion
          matrix[i - 1][j] + 1 // deletion
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Calculate similarity ratio between two strings (0-1)
 */
function similarity(a: string, b: string): number {
  const distance = levenshteinDistance(a, b);
  const maxLength = Math.max(a.length, b.length);
  if (maxLength === 0) return 1;
  return 1 - distance / maxLength;
}

/**
 * Extract numbers from a string (for track number comparison)
 */
function extractNumbers(str: string): number[] {
  const matches = str.match(/\d+/g);
  return matches ? matches.map(Number) : [];
}

/**
 * Check if two titles have matching track numbers
 * Returns true if no numbers found, or if numbers match
 */
function numbersMatch(a: string, b: string): boolean {
  const numsA = extractNumbers(a);
  const numsB = extractNumbers(b);

  // If neither has numbers, consider them potentially similar
  if (numsA.length === 0 && numsB.length === 0) return true;

  // If one has numbers and the other doesn't, they might still be similar
  if (numsA.length === 0 || numsB.length === 0) return true;

  // Both have numbers - they must have at least one number in common
  return numsA.some(n => numsB.includes(n));
}

// ============================================================================
// Duplicate Detection
// ============================================================================

/**
 * Group songs by normalized artist name
 */
function groupByArtist(songs: Song[]): Map<string, Song[]> {
  const groups = new Map<string, Song[]>();

  for (const song of songs) {
    const normalizedArtist = normalizeArtist(song.artist);
    const existing = groups.get(normalizedArtist) || [];
    existing.push(song);
    groups.set(normalizedArtist, existing);
  }

  return groups;
}

/**
 * Find exact duplicates (same normalized title + artist)
 */
function findExactDuplicates(songs: Song[]): DuplicateGroup[] {
  const groups: DuplicateGroup[] = [];
  const titleGroups = new Map<string, Song[]>();

  // Group by normalized title
  for (const song of songs) {
    const normalizedTitle = normalizeTitle(song.title);
    const existing = titleGroups.get(normalizedTitle) || [];
    existing.push(song);
    titleGroups.set(normalizedTitle, existing);
  }

  // Find groups with more than one song
  for (const [normalizedTitle, groupSongs] of titleGroups) {
    if (groupSongs.length > 1) {
      const sorted = sortByQuality(groupSongs);
      groups.push({
        type: "exact",
        baseTitle: normalizedTitle,
        artist: groupSongs[0].artist,
        songs: groupSongs,
        toKeep: sorted[0],
        toDelete: sorted.slice(1),
      });
    }
  }

  return groups;
}

/**
 * Find variation duplicates (similar titles from same artist)
 */
function findVariationDuplicates(
  songs: Song[],
  similarityThreshold: number = 0.85
): DuplicateGroup[] {
  const groups: DuplicateGroup[] = [];
  const processed = new Set<string>();

  for (let i = 0; i < songs.length; i++) {
    const song = songs[i];
    if (processed.has(song.id)) continue;

    const normalizedTitle = normalizeTitle(song.title);
    const similarSongs: Song[] = [song];

    for (let j = i + 1; j < songs.length; j++) {
      const other = songs[j];
      if (processed.has(other.id)) continue;

      const otherNormalizedTitle = normalizeTitle(other.title);

      // Check if titles are similar enough AND track numbers match
      const sim = similarity(normalizedTitle, otherNormalizedTitle);
      const numsOk = numbersMatch(song.title, other.title);
      if (sim >= similarityThreshold && numsOk) {
        similarSongs.push(other);
        processed.add(other.id);
      }
    }

    if (similarSongs.length > 1) {
      processed.add(song.id);
      const sorted = sortByQuality(similarSongs);
      groups.push({
        type: "variation",
        baseTitle: normalizedTitle,
        artist: song.artist,
        songs: similarSongs,
        toKeep: sorted[0],
        toDelete: sorted.slice(1),
      });
    }
  }

  return groups;
}

/**
 * Sort songs by quality (best first)
 * Priority: albumArt > spotifyId > oldest createdAt
 */
function sortByQuality(songs: Song[]): Song[] {
  return [...songs].sort((a, b) => {
    // Prefer with albumArt
    if (a.albumArt && !b.albumArt) return -1;
    if (!a.albumArt && b.albumArt) return 1;

    // Prefer with spotifyId
    if (a.spotifyId && !b.spotifyId) return -1;
    if (!a.spotifyId && b.spotifyId) return 1;

    // Prefer oldest (first added)
    const aDate = a.createdAt ? new Date(a.createdAt).getTime() : Infinity;
    const bDate = b.createdAt ? new Date(b.createdAt).getTime() : Infinity;
    return aDate - bDate;
  });
}

// ============================================================================
// Database Operations
// ============================================================================

async function getAllSongs(): Promise<Song[]> {
  const songs = await db
    .select({
      id: schema.songs.id,
      title: schema.songs.title,
      artist: schema.songs.artist,
      album: schema.songs.album,
      year: schema.songs.year,
      genre: schema.songs.genre,
      spotifyId: schema.songs.spotifyId,
      albumArt: schema.songs.albumArt,
      filePath: schema.songs.filePath,
      createdAt: schema.songs.createdAt,
    })
    .from(schema.songs);

  return songs;
}

// In-memory cache for musiques.json
let musiquesJsonCache: any[] | null = null;
let musiquesJsonModified = false;

async function loadMusiquesJson(): Promise<any[]> {
  if (musiquesJsonCache !== null) return musiquesJsonCache;

  try {
    const content = await fs.readFile(MUSIQUES_JSON_PATH, "utf-8");
    musiquesJsonCache = JSON.parse(content);
    return musiquesJsonCache!;
  } catch {
    console.log("  ⚠️  Could not load musiques.json");
    musiquesJsonCache = [];
    return [];
  }
}

async function saveMusiquesJson(): Promise<void> {
  if (!musiquesJsonModified || musiquesJsonCache === null) return;

  await fs.writeFile(
    MUSIQUES_JSON_PATH,
    JSON.stringify(musiquesJsonCache, null, 2)
  );
  console.log(`\n💾 musiques.json mis à jour`);
}

async function removeFromMusiquesJson(song: Song): Promise<boolean> {
  const musiques = await loadMusiquesJson();

  // Find by title + artist (case-insensitive)
  const index = musiques.findIndex(
    (m: any) =>
      m.title?.toLowerCase() === song.title.toLowerCase() &&
      m.artist?.toLowerCase() === song.artist.toLowerCase()
  );

  if (index !== -1) {
    musiques.splice(index, 1);
    musiquesJsonModified = true;
    return true;
  }
  return false;
}

async function deleteSong(song: Song): Promise<void> {
  // Delete from database
  await db.delete(schema.songs).where(eq(schema.songs.id, song.id));

  // Delete audio file if exists
  if (song.filePath) {
    const absolutePath = path.isAbsolute(song.filePath)
      ? song.filePath
      : path.join(SERVER_ROOT, song.filePath);
    try {
      await fs.unlink(absolutePath);
      console.log(`  🗑️  Deleted file: ${path.basename(absolutePath)}`);
    } catch {
      // File might not exist, that's OK
    }
  }

  // Remove from musiques.json
  const removedFromJson = await removeFromMusiquesJson(song);
  if (removedFromJson) {
    console.log(`  📄 Removed from musiques.json`);
  }
}

// ============================================================================
// User Interaction
// ============================================================================

function createReadlineInterface(): readline.Interface {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

async function askConfirmation(
  rl: readline.Interface,
  question: string
): Promise<boolean> {
  return new Promise((resolve) => {
    rl.question(`${question} (y/n): `, (answer) => {
      resolve(answer.toLowerCase() === "y" || answer.toLowerCase() === "yes");
    });
  });
}

// ============================================================================
// Display Functions
// ============================================================================

function displayDuplicateGroup(group: DuplicateGroup, index: number): void {
  const emoji = group.type === "exact" ? "🔴" : "🟡";
  const typeLabel =
    group.type === "exact" ? "Doublon exact" : "Variation détectée";

  console.log(`\n${emoji} [${index + 1}] ${typeLabel}: ${group.artist}`);
  console.log(`   Base: "${group.baseTitle}"`);

  for (const song of group.songs) {
    const isKeep = song.id === group.toKeep.id;
    const marker = isKeep ? "✓ GARDER" : "✗ SUPPRIMER";
    const meta = [
      song.album ? `album: ${song.album}` : null,
      song.year ? `${song.year}` : null,
      song.spotifyId ? "spotify✓" : null,
      song.albumArt ? "art✓" : null,
    ]
      .filter(Boolean)
      .join(", ");

    console.log(`   ${isKeep ? "→" : " "} "${song.title}" (${meta}) [${marker}]`);
  }
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
  console.log("🔍 Song Duplicate Finder");
  console.log("========================\n");

  // Parse arguments
  const args = process.argv.slice(2);
  const deleteMode = args.includes("--delete");
  const interactiveMode = args.includes("--interactive");
  const exportArg = args.find((a) => a.startsWith("--export="));
  const exportFile = exportArg ? exportArg.split("=")[1] : null;

  if (deleteMode) console.log("⚠️  Mode suppression activé\n");
  if (interactiveMode) console.log("👤 Mode interactif activé\n");
  if (exportFile) console.log(`📄 Export vers: ${exportFile}\n`);

  // Database is already initialized by importing db
  console.log("🗄️  Connexion à la base de données...");

  // Get all songs
  const songs = await getAllSongs();
  console.log(`📊 ${songs.length} chansons trouvées\n`);

  // Group by artist
  const artistGroups = groupByArtist(songs);

  // Find duplicates
  const allDuplicates: DuplicateGroup[] = [];

  for (const [artist, artistSongs] of artistGroups) {
    // Skip artists with only one song
    if (artistSongs.length < 2) continue;

    // Find exact duplicates first
    const exactDupes = findExactDuplicates(artistSongs);
    allDuplicates.push(...exactDupes);

    // Find variation duplicates (excluding already found exact duplicates)
    const exactIds = new Set(exactDupes.flatMap((g) => g.songs.map((s) => s.id)));
    const remaining = artistSongs.filter((s) => !exactIds.has(s.id));
    const variations = findVariationDuplicates(remaining);
    allDuplicates.push(...variations);
  }

  // Display results
  if (allDuplicates.length === 0) {
    console.log("✅ Aucun doublon trouvé!");
    return;
  }

  const exactCount = allDuplicates.filter((d) => d.type === "exact").length;
  const variationCount = allDuplicates.filter(
    (d) => d.type === "variation"
  ).length;
  const toDeleteCount = allDuplicates.reduce(
    (acc, d) => acc + d.toDelete.length,
    0
  );

  console.log("📊 Résultats de l'analyse");
  console.log("========================");
  console.log(`   🔴 Doublons exacts: ${exactCount}`);
  console.log(`   🟡 Variations: ${variationCount}`);
  console.log(`   🗑️  À supprimer: ${toDeleteCount} fichiers`);

  // Display each group
  for (let i = 0; i < allDuplicates.length; i++) {
    displayDuplicateGroup(allDuplicates[i], i);
  }

  // Export if requested
  if (exportFile) {
    const exportData = allDuplicates.map((g) => ({
      type: g.type,
      artist: g.artist,
      baseTitle: g.baseTitle,
      toKeep: {
        id: g.toKeep.id,
        title: g.toKeep.title,
        album: g.toKeep.album,
      },
      toDelete: g.toDelete.map((s) => ({
        id: s.id,
        title: s.title,
        album: s.album,
      })),
    }));
    await fs.writeFile(exportFile, JSON.stringify(exportData, null, 2));
    console.log(`\n📄 Exporté vers ${exportFile}`);
  }

  // Handle deletion
  if (deleteMode || interactiveMode) {
    const rl = interactiveMode ? createReadlineInterface() : null;
    let deletedCount = 0;

    console.log("\n🗑️  Suppression des doublons...\n");

    for (const group of allDuplicates) {
      for (const song of group.toDelete) {
        let shouldDelete = true;

        if (interactiveMode && rl) {
          console.log(`\n${group.artist} - "${song.title}"`);
          console.log(`  Garder: "${group.toKeep.title}"`);
          shouldDelete = await askConfirmation(
            rl,
            "  Supprimer ce doublon?"
          );
        }

        if (shouldDelete) {
          await deleteSong(song);
          console.log(`  ✓ Supprimé: ${song.artist} - "${song.title}"`);
          deletedCount++;
        } else {
          console.log(`  ⏭️  Ignoré`);
        }
      }
    }

    if (rl) rl.close();

    // Save changes to musiques.json
    await saveMusiquesJson();

    console.log(`\n========================`);
    console.log(`📊 Résumé: ${deletedCount} chansons supprimées`);
  } else {
    console.log("\n💡 Pour supprimer les doublons, utilisez:");
    console.log("   --delete       Suppression automatique");
    console.log("   --interactive  Confirmation avant chaque suppression");
  }
}

main().catch(console.error);
