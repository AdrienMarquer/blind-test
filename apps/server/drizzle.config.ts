import type { Config } from 'drizzle-kit';

// PostgreSQL only configuration
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://adriquiz:adriquiz_dev@localhost:5432/adriquiz';

const config: Config = {
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: DATABASE_URL,
  },
};

export default config;
