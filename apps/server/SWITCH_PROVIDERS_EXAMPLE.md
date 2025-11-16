# How to Switch Metadata Providers - Examples

This guide shows you exactly how to switch between different metadata enrichment providers.

## Current Implementation

The system uses the **Strategy Pattern**, which means you can swap providers without changing any code - just environment variables!

## Example 1: Start with Spotify (Free)

1. Edit `.env`:
```bash
METADATA_PROVIDER=spotify
SPOTIFY_CLIENT_ID=abc123...
SPOTIFY_CLIENT_SECRET=xyz789...
```

2. Restart server:
```bash
bun run dev
```

3. Import a YouTube video - it will use Spotify for metadata enrichment

## Example 2: Switch to OpenAI

1. Edit `.env`:
```bash
# Just change one line!
METADATA_PROVIDER=ai-openai
OPENAI_API_KEY=sk-proj-...
```

2. Restart server:
```bash
bun run dev
```

3. Import the same YouTube video - now it uses OpenAI instead!

## Example 3: Try Different Providers

Test multiple providers to see which works best for your music:

### Test 1: Spotify
```bash
METADATA_PROVIDER=spotify bun run dev
```
Import: "Radiohead - Creep (Official Video)"
Result: ✅ High confidence (98%), found in Spotify catalog

### Test 2: OpenAI
```bash
METADATA_PROVIDER=ai-openai OPENAI_API_KEY=sk-... bun run dev
```
Import: "Radiohead - Creep (Official Video)"
Result: ✅ High confidence (95%), recognized the song

### Test 3: Google Gemini (Free)
```bash
METADATA_PROVIDER=ai-google GOOGLE_API_KEY=... bun run dev
```
Import: "Radiohead - Creep (Official Video)"
Result: ✅ Medium confidence (85%), identified correctly

## Example 4: Obscure Music Test

For lesser-known music, AI providers often work better:

### Test: "deadmau5 & Kaskade - I Remember (HQ)"

**Spotify:**
```bash
METADATA_PROVIDER=spotify
# Result: ✅ 92% confidence
# Title: "I Remember"
# Artist: "deadmau5, Kaskade"
```

**OpenAI:**
```bash
METADATA_PROVIDER=ai-openai
# Result: ✅ 95% confidence
# Title: "I Remember"
# Artist: "deadmau5 & Kaskade"
```

**Anthropic:**
```bash
METADATA_PROVIDER=ai-anthropic
# Result: ✅ 93% confidence
# Title: "I Remember"
# Artist: "deadmau5, Kaskade"
```

## Example 5: Batch Processing (Playlists)

When importing playlists, AI providers are more efficient:

### Spotify (individual requests)
```bash
METADATA_PROVIDER=spotify
# 10 songs = 10 API calls
# Time: ~5 seconds
# Cost: $0
```

### OpenAI (batch request)
```bash
METADATA_PROVIDER=ai-openai
# 10 songs = 1 API call
# Time: ~2 seconds
# Cost: ~$0.002
```

### Anthropic (batch request)
```bash
METADATA_PROVIDER=ai-anthropic
# 10 songs = 1 API call
# Time: ~3 seconds
# Cost: ~$0.005
```

## Example 6: Cost Comparison

Import 100 songs from YouTube playlist:

### Scenario A: Free (Spotify)
```bash
METADATA_PROVIDER=spotify
# Cost: $0
# Accuracy for popular songs: ⭐⭐⭐⭐⭐
# Accuracy for obscure songs: ⭐⭐
```

### Scenario B: Budget (Google Gemini Free Tier)
```bash
METADATA_PROVIDER=ai-google
# Cost: $0 (within 1500/day limit)
# Accuracy for popular songs: ⭐⭐⭐⭐
# Accuracy for obscure songs: ⭐⭐⭐⭐
```

### Scenario C: Best Accuracy (OpenAI)
```bash
METADATA_PROVIDER=ai-openai
# Cost: ~$0.10 (100 songs)
# Accuracy for popular songs: ⭐⭐⭐⭐
# Accuracy for obscure songs: ⭐⭐⭐⭐⭐
```

## Example 7: Programmatic Switching

If you want to switch providers in code:

```typescript
import { metadataEnrichmentService } from './services/MetadataEnrichmentService.v2';
import { AIMetadataProvider } from './services/enrichment';

// Check current provider
console.log(metadataEnrichmentService.getProvider().name); // "spotify"

// Switch to OpenAI for obscure music
const aiProvider = new AIMetadataProvider({
  provider: 'openai',
  apiKey: process.env.OPENAI_API_KEY!,
  enabled: true
});

metadataEnrichmentService.setProvider(aiProvider);

// Now enrichment uses OpenAI
const result = await metadataEnrichmentService.enrichFromYouTube({
  title: "Some Obscure Indie Band - Song Title",
  uploader: "IndieLabel",
  duration: 180
});

console.log(result.provider); // "ai-openai"
```

## Example 8: Hybrid Approach

Use different providers for different scenarios:

```typescript
import { MetadataProviderFactory } from './services/enrichment';

const spotifyProvider = MetadataProviderFactory.create('spotify', { enabled: true });
const aiProvider = MetadataProviderFactory.create('ai-openai', {
  apiKey: process.env.OPENAI_API_KEY,
  enabled: true
});

async function enrichWithFallback(video: YouTubeMetadata) {
  // Try Spotify first (free)
  metadataEnrichmentService.setProvider(spotifyProvider);
  const spotifyResult = await metadataEnrichmentService.enrichFromYouTube(video);

  // If low confidence, try AI
  if (spotifyResult.enriched.confidence < 70) {
    metadataEnrichmentService.setProvider(aiProvider);
    return await metadataEnrichmentService.enrichFromYouTube(video);
  }

  return spotifyResult;
}
```

## Summary

**To switch providers:**
1. Change `METADATA_PROVIDER` in `.env`
2. Add API key for that provider
3. Restart server
4. Done!

**No code changes needed!** ✅

The system is designed to make switching providers as easy as changing one line in your environment configuration.
