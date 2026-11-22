import { defineConfig } from 'prisma/config';

// Load the repo-level .env when present (Node built-in, no dotenv dependency).
try {
  process.loadEnvFile('../../.env');
} catch {
  // No .env file: rely on the process environment.
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env['DATABASE_URL'] ?? '',
  },
});
