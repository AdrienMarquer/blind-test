/**
 * Metadata Provider Factory
 * Creates and manages metadata enrichment providers
 */

import type { IMetadataProvider, ProviderConfig } from './IMetadataProvider';
import { SpotifyMetadataProvider } from './SpotifyMetadataProvider';
import { AIMetadataProvider, type AIProviderConfig } from './AIMetadataProvider';

export type ProviderType = 'spotify' | 'ai-openai' | 'ai-anthropic' | 'ai-google' | 'ai-custom';

export interface ProvidersConfig {
	default: ProviderType;
	providers: {
		spotify?: ProviderConfig;
		'ai-openai'?: AIProviderConfig;
		'ai-anthropic'?: AIProviderConfig;
		'ai-google'?: AIProviderConfig;
		'ai-custom'?: AIProviderConfig;
	};
}

/**
 * Factory for creating metadata providers
 */
export class MetadataProviderFactory {
	/**
	 * Create a provider instance
	 */
	static create(type: ProviderType, config?: ProviderConfig): IMetadataProvider {
		switch (type) {
			case 'spotify':
				return new SpotifyMetadataProvider(config);

			case 'ai-openai':
				return new AIMetadataProvider({
					...config,
					provider: 'openai',
					apiKey: config?.apiKey || process.env.OPENAI_API_KEY || '',
					enabled: config?.enabled ?? true
				} as AIProviderConfig);

			case 'ai-anthropic':
				return new AIMetadataProvider({
					...config,
					provider: 'anthropic',
					apiKey: config?.apiKey || process.env.ANTHROPIC_API_KEY || '',
					enabled: config?.enabled ?? true
				} as AIProviderConfig);

			case 'ai-google':
				return new AIMetadataProvider({
					...config,
					provider: 'google',
					apiKey: config?.apiKey || process.env.GOOGLE_API_KEY || '',
					enabled: config?.enabled ?? true
				} as AIProviderConfig);

			case 'ai-custom':
				if (!config) {
					throw new Error('Custom AI provider requires configuration');
				}
				return new AIMetadataProvider(config as AIProviderConfig);

			default:
				throw new Error(`Unknown provider type: ${type}`);
		}
	}

	/**
	 * Create provider from environment variables
	 */
	static createFromEnv(): IMetadataProvider {
		const providerType = (process.env.METADATA_PROVIDER as ProviderType) || 'spotify';

		switch (providerType) {
			case 'spotify':
				return new SpotifyMetadataProvider({ enabled: true });

			case 'ai-openai':
				return new AIMetadataProvider({
					provider: 'openai',
					apiKey: process.env.OPENAI_API_KEY || '',
					model: process.env.OPENAI_MODEL,
					enabled: true
				});

			case 'ai-anthropic':
				return new AIMetadataProvider({
					provider: 'anthropic',
					apiKey: process.env.ANTHROPIC_API_KEY || '',
					model: process.env.ANTHROPIC_MODEL,
					enabled: true
				});

			case 'ai-google':
				return new AIMetadataProvider({
					provider: 'google',
					apiKey: process.env.GOOGLE_API_KEY || '',
					model: process.env.GOOGLE_MODEL,
					enabled: true
				});

			default:
				// Fallback to Spotify
				return new SpotifyMetadataProvider({ enabled: true });
		}
	}

	/**
	 * Create both primary and fallback providers from environment variables
	 * Returns { primary, fallback } where fallback is null if not configured or same as primary
	 */
	static createProvidersFromEnv(): { primary: IMetadataProvider; fallback: IMetadataProvider | null } {
		const primaryType = (process.env.METADATA_PROVIDER as ProviderType) || 'spotify';
		const fallbackType = process.env.METADATA_FALLBACK_PROVIDER as ProviderType | undefined;

		console.log(`[MetadataProviderFactory] Reading env: METADATA_PROVIDER=${primaryType}, METADATA_FALLBACK_PROVIDER=${fallbackType || 'not set'}`);

		// Create primary provider
		const primary = this.createFromEnv();

		// Create fallback provider if configured and different from primary
		let fallback: IMetadataProvider | null = null;
		if (fallbackType && fallbackType !== primaryType) {
			try {
				fallback = this.create(fallbackType);
				console.log(`[MetadataProviderFactory] Initialized with primary: ${primary.name}, fallback: ${fallback.name}`);
			} catch (error) {
				console.error(`[MetadataProviderFactory] Failed to initialize fallback provider ${fallbackType}:`, error);
			}
		} else {
			console.log(`[MetadataProviderFactory] Initialized with primary: ${primary.name}, no fallback`);
		}

		return { primary, fallback };
	}
}

/**
 * Provider Manager - handles multiple providers with fallback
 */
export class MetadataProviderManager {
	private providers: Map<string, IMetadataProvider> = new Map();
	private defaultProvider: IMetadataProvider;

	constructor(config: ProvidersConfig) {
		// Initialize providers
		if (config.providers.spotify) {
			const provider = MetadataProviderFactory.create('spotify', config.providers.spotify);
			this.providers.set('spotify', provider);
		}

		if (config.providers['ai-openai']) {
			const provider = MetadataProviderFactory.create('ai-openai', config.providers['ai-openai']);
			this.providers.set('ai-openai', provider);
		}

		if (config.providers['ai-anthropic']) {
			const provider = MetadataProviderFactory.create('ai-anthropic', config.providers['ai-anthropic']);
			this.providers.set('ai-anthropic', provider);
		}

		if (config.providers['ai-google']) {
			const provider = MetadataProviderFactory.create('ai-google', config.providers['ai-google']);
			this.providers.set('ai-google', provider);
		}

		if (config.providers['ai-custom']) {
			const provider = MetadataProviderFactory.create('ai-custom', config.providers['ai-custom']);
			this.providers.set('ai-custom', provider);
		}

		// Set default provider
		const defaultProvider = this.providers.get(config.default);
		if (!defaultProvider) {
			throw new Error(`Default provider ${config.default} not configured`);
		}
		this.defaultProvider = defaultProvider;
	}

	/**
	 * Get provider by name
	 */
	getProvider(name: string): IMetadataProvider | undefined {
		return this.providers.get(name);
	}

	/**
	 * Get default provider
	 */
	getDefaultProvider(): IMetadataProvider {
		return this.defaultProvider;
	}

	/**
	 * Get all active providers
	 */
	getActiveProviders(): IMetadataProvider[] {
		return Array.from(this.providers.values()).filter(p => p.isReady());
	}

	/**
	 * Search with fallback
	 * Tries default provider first, falls back to others if it fails
	 */
	async searchWithFallback(query: any, limit?: number): Promise<any[]> {
		// Try default provider
		try {
			if (this.defaultProvider.isReady()) {
				return await this.defaultProvider.search(query, limit);
			}
		} catch (error) {
			console.error('Default provider search failed:', error);
		}

		// Try other providers
		for (const provider of this.getActiveProviders()) {
			if (provider === this.defaultProvider) continue;

			try {
				return await provider.search(query, limit);
			} catch (error) {
				console.error(`Provider ${provider.name} search failed:`, error);
			}
		}

		// All providers failed
		return [];
	}
}
