# Metadata Enrichment Providers

This module provides a pluggable system for enriching YouTube video metadata with accurate song information. It supports multiple providers including Spotify, OpenAI, Anthropic Claude, and Google Gemini.

## Architecture

The system uses the **Strategy Pattern** to allow easy switching between different metadata enrichment providers:

- **IMetadataProvider**: Abstract interface that all providers implement
- **SpotifyMetadataProvider**: Uses Spotify Web API for music metadata
- **AIMetadataProvider**: Uses AI APIs (OpenAI, Anthropic, Google, or custom) for metadata enrichment
- **MetadataProviderFactory**: Factory for creating provider instances
- **MetadataEnrichmentService**: Main service that uses configured provider

## Providers

### 1. Spotify (Default)

Uses the Spotify Web API to search for tracks and fetch metadata.

**Pros:**
- High accuracy for popular songs
- Rich metadata (album art, preview URLs, genres)
- Free tier available
- Confidence scoring based on fuzzy matching

**Cons:**
- Requires Spotify API credentials
- May not find obscure/indie music
- Rate limits on free tier

**Configuration:**
```bash
METADATA_PROVIDER=spotify
SPOTIFY_CLIENT_ID=your_client_id
SPOTIFY_CLIENT_SECRET=your_client_secret
```

### 2. OpenAI (GPT-4o-mini)

Uses OpenAI's GPT models to identify songs based on YouTube titles.

**Pros:**
- Excellent at parsing messy YouTube titles
- Can identify obscure songs
- Works well with batch processing
- No rate limits (pay per use)

**Cons:**
- Costs money per API call
- May hallucinate metadata for unknown songs
- No preview URLs or album art

**Configuration:**
```bash
METADATA_PROVIDER=ai-openai
OPENAI_API_KEY=your_api_key
OPENAI_MODEL=gpt-4o-mini  # Optional, defaults to gpt-4o-mini
```

**Cost:** ~$0.001 per song with gpt-4o-mini

### 3. Anthropic Claude

Uses Anthropic's Claude models for metadata enrichment.

**Pros:**
- Excellent reasoning about song metadata
- Good at handling ambiguous titles
- Batch processing support
- Fast responses

**Cons:**
- Costs money per API call
- May provide metadata for unknown songs with lower confidence
- No preview URLs or album art

**Configuration:**
```bash
METADATA_PROVIDER=ai-anthropic
ANTHROPIC_API_KEY=your_api_key
ANTHROPIC_MODEL=claude-3-5-sonnet-20241022  # Optional
```

**Cost:** ~$0.003 per song with Claude 3.5 Sonnet

### 4. Google Gemini

Uses Google's Gemini models for metadata enrichment.

**Pros:**
- Free tier available (generous limits)
- Fast responses
- Good music knowledge
- Batch processing support

**Cons:**
- May not be as accurate as GPT-4 or Claude
- No preview URLs or album art
- API still in beta

**Configuration:**
```bash
METADATA_PROVIDER=ai-google
GOOGLE_API_KEY=your_api_key
GOOGLE_MODEL=gemini-2.0-flash-exp  # Optional
```

**Cost:** Free tier: 15 requests/minute, 1500 requests/day

### 5. Custom AI Provider

Allows you to use any AI API endpoint.

**Configuration:**
```bash
METADATA_PROVIDER=ai-custom
# Requires custom configuration in code
```

## Usage

### Basic Usage (Default Provider)

The service automatically uses the provider configured in environment variables:

```typescript
import { metadataEnrichmentService } from './services/MetadataEnrichmentService.v2';

const result = await metadataEnrichmentService.enrichFromYouTube({
  title: 'Queen - Bohemian Rhapsody (Official Video)',
  uploader: 'Queen Official',
  duration: 354
});

console.log(result.enriched);
// {
//   title: 'Bohemian Rhapsody',
//   artist: 'Queen',
//   album: 'A Night at the Opera',
//   year: 1975,
//   genre: 'rock',
//   confidence: 98
// }
```

### Switching Providers

#### Option 1: Environment Variables

Set `METADATA_PROVIDER` in your `.env` file:

```bash
# Use Spotify (default)
METADATA_PROVIDER=spotify

# Use OpenAI
METADATA_PROVIDER=ai-openai
OPENAI_API_KEY=sk-...

# Use Anthropic
METADATA_PROVIDER=ai-anthropic
ANTHROPIC_API_KEY=sk-ant-...

# Use Google Gemini
METADATA_PROVIDER=ai-google
GOOGLE_API_KEY=...
```

#### Option 2: Programmatically

Create and set a specific provider:

```typescript
import { MetadataEnrichmentService } from './services/MetadataEnrichmentService.v2';
import { AIMetadataProvider } from './services/enrichment/AIMetadataProvider';

// Create AI provider
const aiProvider = new AIMetadataProvider({
  provider: 'anthropic',
  apiKey: 'sk-ant-...',
  model: 'claude-3-5-sonnet-20241022',
  enabled: true
});

// Create service with custom provider
const service = new MetadataEnrichmentService(aiProvider);

// Or update existing service
metadataEnrichmentService.setProvider(aiProvider);
```

### Batch Processing

AI providers are optimized for batch processing (processes all songs in one API call):

```typescript
const videos = [
  { title: 'Song 1', uploader: 'Artist 1', duration: 180 },
  { title: 'Song 2', uploader: 'Artist 2', duration: 200 },
  // ... more videos
];

const results = await metadataEnrichmentService.enrichBatch(videos);
// Returns array of EnrichmentResult (same order as input)
```

**Cost Savings:** Batch processing with AI providers is much more efficient than individual requests.

## Confidence Scores

All providers return a confidence score (0-100):

- **90-100%**: High confidence - metadata is very likely correct
- **50-89%**: Medium confidence - metadata should be reviewed
- **0-49%**: Low confidence - manual correction recommended

### Confidence Calculation (Spotify)

- Title similarity: 40 points (fuzzy match)
- Artist similarity: 40 points (fuzzy match)
- Duration match: 20 points (±5 seconds tolerance)

### Confidence Calculation (AI)

AI providers return their own confidence based on:
- How well the YouTube title matches known song patterns
- Availability of song in their training data
- Ambiguity in the title

## Adding a New Provider

1. Implement `IMetadataProvider` interface:

```typescript
import type { IMetadataProvider, SearchQuery, EnrichedTrackMetadata } from './IMetadataProvider';

export class MyCustomProvider implements IMetadataProvider {
  readonly name = 'my-provider';

  isReady(): boolean {
    return true; // Check if API keys etc. are configured
  }

  async search(query: SearchQuery, limit?: number): Promise<EnrichedTrackMetadata[]> {
    // Implement search logic
    return [];
  }

  async getTrack(providerId: string): Promise<EnrichedTrackMetadata | null> {
    // Implement track lookup (optional)
    return null;
  }

  async batchSearch(queries: SearchQuery[]): Promise<EnrichedTrackMetadata[]> {
    // Implement batch search (or fall back to sequential)
    return [];
  }
}
```

2. Add to factory in `MetadataProviderFactory.ts`:

```typescript
case 'my-provider':
  return new MyCustomProvider(config);
```

3. Update `.env.example`:

```bash
# My Custom Provider
METADATA_PROVIDER=my-provider
MY_PROVIDER_API_KEY=...
```

## Best Practices

### Cost Optimization

1. **Use Spotify for popular music** - It's free and very accurate
2. **Use AI for obscure/indie music** - Better at identifying lesser-known songs
3. **Batch process with AI** - Send multiple songs in one request
4. **Cache results** - Store enriched metadata to avoid re-processing

### Provider Selection

```
Spotify:     Popular music, free tier, album art
OpenAI:      Obscure music, expensive, very accurate
Anthropic:   Best reasoning, good for ambiguous titles
Gemini:      Free tier, good balance, beta quality
```

### Fallback Strategy

```typescript
import { MetadataProviderManager } from './services/enrichment/MetadataProviderFactory';

const manager = new MetadataProviderManager({
  default: 'spotify',
  providers: {
    spotify: { enabled: true },
    'ai-openai': {
      enabled: true,
      apiKey: process.env.OPENAI_API_KEY,
      priority: 2
    }
  }
});

// Tries Spotify first, falls back to OpenAI if Spotify fails
const results = await manager.searchWithFallback(query);
```

## Testing

Set environment variable to switch providers:

```bash
# Test with Spotify
METADATA_PROVIDER=spotify bun run dev

# Test with OpenAI
METADATA_PROVIDER=ai-openai OPENAI_API_KEY=sk-... bun run dev

# Test with Anthropic
METADATA_PROVIDER=ai-anthropic ANTHROPIC_API_KEY=sk-ant-... bun run dev
```

## Monitoring

Check which provider is being used:

```typescript
const provider = metadataEnrichmentService.getProvider();
console.log(`Using provider: ${provider.name}`);
console.log(`Provider ready: ${provider.isReady()}`);
```

## Future Improvements

- [ ] MusicBrainz provider (free, open-source database)
- [ ] Last.fm provider (good for genres/tags)
- [ ] Hybrid provider (try multiple, merge results)
- [ ] Caching layer to reduce API calls
- [ ] Metrics/analytics for provider performance
- [ ] A/B testing between providers
