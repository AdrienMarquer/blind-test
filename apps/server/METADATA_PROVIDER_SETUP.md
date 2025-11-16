# Metadata Provider Setup Guide

## Quick Start

The blind test app uses metadata enrichment to automatically identify songs from YouTube videos. You can use **Spotify** (free) or **AI providers** (OpenAI, Anthropic, Google Gemini).

## 1. Choose Your Provider

### Option A: Spotify (Recommended for most users)

**Best for:** Popular music, free tier available

1. Create a Spotify Developer account: https://developer.spotify.com/dashboard
2. Create a new app
3. Copy your Client ID and Client Secret
4. Add to `.env`:

```bash
METADATA_PROVIDER=spotify
SPOTIFY_CLIENT_ID=your_client_id_here
SPOTIFY_CLIENT_SECRET=your_client_secret_here
```

### Option B: OpenAI (Best accuracy)

**Best for:** Obscure music, batch processing
**Cost:** ~$0.001 per song

1. Get API key: https://platform.openai.com/api-keys
2. Add to `.env`:

```bash
METADATA_PROVIDER=ai-openai
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini  # Optional
```

### Option C: Anthropic Claude (Best reasoning)

**Best for:** Ambiguous titles, complex parsing
**Cost:** ~$0.003 per song

1. Get API key: https://console.anthropic.com/
2. Add to `.env`:

```bash
METADATA_PROVIDER=ai-anthropic
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-3-5-sonnet-20241022  # Optional
```

### Option D: Google Gemini (Free tier)

**Best for:** Budget-conscious users, testing
**Limits:** Free tier: 15 requests/minute, 1500 requests/day

1. Get API key: https://aistudio.google.com/app/apikey
2. Add to `.env`:

```bash
METADATA_PROVIDER=ai-google
GOOGLE_API_KEY=your_key_here
GOOGLE_MODEL=gemini-2.0-flash-exp  # Optional
```

## 2. Test Your Setup

Start the server and import a YouTube video:

```bash
bun run dev
```

Watch the console for enrichment logs:
- **Spotify:** Logs search results and confidence scores
- **AI providers:** Shows AI model being used

## 3. Switching Providers

You can switch providers anytime by changing `METADATA_PROVIDER` in `.env`:

```bash
# Switch to AI
METADATA_PROVIDER=ai-openai

# Switch back to Spotify
METADATA_PROVIDER=spotify
```

Restart the server for changes to take effect.

## 4. Cost Estimates

### Spotify
- **Free tier:** 100 requests/30 seconds
- **Cost:** $0

### OpenAI (gpt-4o-mini)
- **Input:** ~150 tokens per song
- **Output:** ~50 tokens per song
- **Cost:** ~$0.001 per song
- **100 songs:** ~$0.10
- **1000 songs:** ~$1.00

### Anthropic (Claude 3.5 Sonnet)
- **Input:** ~150 tokens per song
- **Output:** ~50 tokens per song
- **Cost:** ~$0.003 per song
- **100 songs:** ~$0.30
- **1000 songs:** ~$3.00

### Google Gemini (Free tier)
- **Limits:** 1500 requests/day
- **Cost:** $0 (within limits)
- **Overage:** Pay-as-you-go pricing

## 5. Batch Processing (AI Only)

AI providers support batch processing for efficiency:

When importing a YouTube playlist, the app automatically batches all songs into a single AI request instead of making individual calls. This is **much cheaper** and faster.

**Example:**
- Individual requests: 10 songs × $0.001 = $0.01
- Batch request: 1 request for 10 songs = $0.002

## 6. Best Practices

### For Popular Music
✅ Use **Spotify** - Free and very accurate

### For Obscure/Indie Music
✅ Use **AI providers** - Better at identifying lesser-known songs

### For Budget-Conscious
✅ Start with **Spotify**
✅ Use **Google Gemini** free tier for testing
✅ Upgrade to **OpenAI** only if needed

### For Maximum Accuracy
✅ Use **OpenAI GPT-4o-mini** or **Anthropic Claude**

## 7. Troubleshooting

### "Provider not ready"
- Check that API keys are set correctly in `.env`
- Verify `METADATA_PROVIDER` matches your configuration
- Restart the server

### Low confidence scores
- AI providers may not recognize very obscure songs
- Try switching providers
- Manually correct metadata in the UI

### Rate limits
- **Spotify:** Wait 30 seconds between bursts
- **OpenAI/Anthropic:** No rate limits (pay per use)
- **Google Gemini:** 15 requests/minute on free tier

## 8. Provider Comparison

| Feature | Spotify | OpenAI | Anthropic | Google Gemini |
|---------|---------|--------|-----------|---------------|
| **Cost** | Free | $0.001/song | $0.003/song | Free* |
| **Accuracy (Popular)** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ |
| **Accuracy (Obscure)** | ⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| **Album Art** | ✅ | ❌ | ❌ | ❌ |
| **Preview URLs** | ✅ | ❌ | ❌ | ❌ |
| **Batch Processing** | ❌ | ✅ | ✅ | ✅ |
| **Rate Limits** | 100/30s | None** | None** | 15/min |

*Free tier limits apply
**Pay per use

## Need Help?

Check the full documentation: `apps/server/src/services/enrichment/README.md`
