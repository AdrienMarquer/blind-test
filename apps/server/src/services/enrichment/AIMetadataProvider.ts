/**
 * AI Metadata Provider
 * Uses AI APIs (OpenAI, Anthropic, etc.) to enrich music metadata
 * Supports batch processing for efficiency
 */

import type { IMetadataProvider, EnrichedTrackMetadata, SearchQuery, ProviderConfig } from './IMetadataProvider';
import { GenreMapper } from '../GenreMapper';

export interface AIProviderConfig extends ProviderConfig {
	provider: 'openai' | 'anthropic' | 'google' | 'custom';
	apiKey: string;
	model?: string;
	endpoint?: string; // For custom providers
	temperature?: number;
	maxTokens?: number;
}

/**
 * AI Metadata Provider
 * Uses AI to enrich metadata based on YouTube title/artist
 */
export class AIMetadataProvider implements IMetadataProvider {
	readonly name: string;
	private config: AIProviderConfig;

	constructor(config: AIProviderConfig) {
		this.config = config;
		this.name = `ai-${config.provider}`;
	}

	isReady(): boolean {
		return this.config.enabled && !!this.config.apiKey;
	}

	async search(query: SearchQuery, limit: number = 10): Promise<EnrichedTrackMetadata[]> {
		if (!this.isReady()) {
			throw new Error(`AI provider ${this.config.provider} not ready`);
		}

		// For single queries, we use a simple prompt
		const prompt = this.buildSearchPrompt(query);
		const response = await this.callAI(prompt);

		// Parse AI response
		const result = this.parseAIResponse(response);

		return result ? [result] : [];
	}

	async getTrack(providerId: string): Promise<EnrichedTrackMetadata | null> {
		// AI providers don't have IDs, always return null
		return null;
	}

	/**
	 * Batch search - optimized for AI providers
	 * Sends all queries in one request for efficiency
	 */
	async batchSearch(queries: SearchQuery[]): Promise<EnrichedTrackMetadata[]> {
		if (!this.isReady()) {
			throw new Error(`AI provider ${this.config.provider} not ready`);
		}

		const prompt = this.buildBatchPrompt(queries);
		const response = await this.callAI(prompt);

		// Parse batch response
		return this.parseBatchResponse(response, queries);
	}

	/**
	 * Build prompt for single search
	 */
	private buildSearchPrompt(query: SearchQuery): string {
		return `You are a music metadata expert. Given a YouTube video title and uploader name, identify the correct song metadata.

YouTube Title: "${query.title || ''}"
Uploader: "${query.artist || ''}"
${query.year ? `Year hint: ${query.year}` : ''}
${query.duration ? `Duration: ${query.duration} seconds` : ''}

Respond with a JSON object containing:
{
  "title": "Song title",
  "artist": "Artist name",
  "album": "Album name (if known)",
  "year": 2024,
  "genre": "Primary genre",
  "confidence": 95
}

Confidence should be 0-100 based on how certain you are about the metadata.
If you're unsure, provide your best guess but lower the confidence score accordingly.

JSON response:`;
	}

	/**
	 * Build batch prompt for multiple queries
	 */
	private buildBatchPrompt(queries: SearchQuery[]): string {
		const queryList = queries.map((q, i) =>
			`${i + 1}. Title: "${q.title || ''}" | Uploader: "${q.artist || ''}"${q.duration ? ` | Duration: ${q.duration}s` : ''}`
		).join('\n');

		return `You are a music metadata expert. Given a list of YouTube video titles and uploader names, identify the correct song metadata for each.

Songs to identify:
${queryList}

For each song, provide metadata in JSON format. Respond with a JSON array:
[
  {
    "title": "Song title",
    "artist": "Artist name",
    "album": "Album name (if known)",
    "year": 2024,
    "genre": "Primary genre",
    "confidence": 95
  },
  ...
]

Confidence should be 0-100 based on certainty. Provide your best guess for each song.

JSON array response:`;
	}

	/**
	 * Call AI API based on provider
	 */
	private async callAI(prompt: string): Promise<string> {
		switch (this.config.provider) {
			case 'openai':
				return this.callOpenAI(prompt);
			case 'anthropic':
				return this.callAnthropic(prompt);
			case 'google':
				return this.callGoogle(prompt);
			case 'custom':
				return this.callCustom(prompt);
			default:
				throw new Error(`Unsupported AI provider: ${this.config.provider}`);
		}
	}

	/**
	 * Call OpenAI API
	 */
	private async callOpenAI(prompt: string): Promise<string> {
		const response = await fetch('https://api.openai.com/v1/chat/completions', {
			method: 'POST',
			headers: {
				'Authorization': `Bearer ${this.config.apiKey}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				model: this.config.model || 'gpt-4o-mini',
				messages: [{ role: 'user', content: prompt }],
				temperature: this.config.temperature || 0.3,
				max_tokens: this.config.maxTokens || 1000
			})
		});

		if (!response.ok) {
			const error = await response.text();
			throw new Error(`OpenAI API error: ${error}`);
		}

		const data = await response.json() as any;
		return data.choices[0].message.content;
	}

	/**
	 * Call Anthropic Claude API
	 */
	private async callAnthropic(prompt: string): Promise<string> {
		const response = await fetch('https://api.anthropic.com/v1/messages', {
			method: 'POST',
			headers: {
				'x-api-key': this.config.apiKey,
				'anthropic-version': '2023-06-01',
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				model: this.config.model || 'claude-3-5-sonnet-20241022',
				max_tokens: this.config.maxTokens || 1000,
				messages: [{ role: 'user', content: prompt }],
				temperature: this.config.temperature || 0.3
			})
		});

		if (!response.ok) {
			const error = await response.text();
			throw new Error(`Anthropic API error: ${error}`);
		}

		const data = await response.json() as any;
		return data.content[0].text;
	}

	/**
	 * Call Google Gemini API
	 */
	private async callGoogle(prompt: string): Promise<string> {
		const model = this.config.model || 'gemini-2.0-flash-exp';
		const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.config.apiKey}`;

		const response = await fetch(url, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				contents: [{
					parts: [{ text: prompt }]
				}],
				generationConfig: {
					temperature: this.config.temperature || 0.3,
					maxOutputTokens: this.config.maxTokens || 1000
				}
			})
		});

		if (!response.ok) {
			const error = await response.text();
			throw new Error(`Google Gemini API error: ${error}`);
		}

		const data = await response.json() as any;
		return data.candidates[0].content.parts[0].text;
	}

	/**
	 * Call custom AI endpoint
	 */
	private async callCustom(prompt: string): Promise<string> {
		if (!this.config.endpoint) {
			throw new Error('Custom provider requires endpoint configuration');
		}

		const response = await fetch(this.config.endpoint, {
			method: 'POST',
			headers: {
				'Authorization': `Bearer ${this.config.apiKey}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({ prompt })
		});

		if (!response.ok) {
			const error = await response.text();
			throw new Error(`Custom AI API error: ${error}`);
		}

		const data = await response.json() as any;
		return data.response || data.text || data.content;
	}

	/**
	 * Parse single AI response
	 */
	private parseAIResponse(response: string): EnrichedTrackMetadata | null {
		try {
			// Extract JSON from markdown code blocks if present
			let jsonStr = response.trim();
			const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
			if (codeBlockMatch) {
				jsonStr = codeBlockMatch[1];
			}

			const parsed = JSON.parse(jsonStr);

			// Normalize genre using GenreMapper
			const normalizedGenre = GenreMapper.normalize(parsed.genre);

			return {
				title: parsed.title || '',
				artist: parsed.artist || '',
				album: parsed.album,
				year: parsed.year,
				genre: normalizedGenre,
				confidence: parsed.confidence || 50
			};
		} catch (error) {
			console.error('Failed to parse AI response:', error, response);
			return null;
		}
	}

	/**
	 * Parse batch AI response
	 */
	private parseBatchResponse(response: string, queries: SearchQuery[]): EnrichedTrackMetadata[] {
		try {
			// Extract JSON from markdown code blocks if present
			let jsonStr = response.trim();
			const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
			if (codeBlockMatch) {
				jsonStr = codeBlockMatch[1];
			}

			const parsed = JSON.parse(jsonStr);

			if (!Array.isArray(parsed)) {
				throw new Error('Expected JSON array');
			}

			// Map parsed results to EnrichedTrackMetadata with genre normalization
			return parsed.map((item, index) => {
				const normalizedGenre = GenreMapper.normalize(item.genre);

				return {
					title: item.title || queries[index]?.title || '',
					artist: item.artist || queries[index]?.artist || '',
					album: item.album,
					year: item.year,
					genre: normalizedGenre,
					confidence: item.confidence || 50
				};
			});
		} catch (error) {
			console.error('Failed to parse batch AI response:', error, response);
			// Return empty results with 0 confidence
			return queries.map(q => ({
				title: q.title || '',
				artist: q.artist || '',
				confidence: 0
			}));
		}
	}
}
