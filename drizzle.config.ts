import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './lib/main/db/schema.ts',
  out: './lib/main/db/migrations',
  dialect: 'sqlite',
  dbCredentials: {
    url: './data.db',
  },
})