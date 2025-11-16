/**
 * Metadata Enrichment Service
 * Enriches YouTube video metadata with accurate song information using pluggable providers
 *
 * Supports multiple metadata providers:
 * - Spotify (free, best for popular music)
 * - OpenAI (AI-powered, great for obscure music)
 * - Anthropic Claude (AI-powered, best reasoning)
 * - Google Gemini (AI-powered, free tier)
 *
 * Switch providers via METADATA_PROVIDER environment variable
 */

export * from './MetadataEnrichmentService.v2';
