import { defineConfig } from 'drizzle-kit'

// Só gera as migrações (npm run db:generate). Quem aplica é o próprio app, em src/main/db/migrate.ts.
export default defineConfig({
  dialect: 'sqlite',
  schema: './src/main/db/schema.ts',
  out: './src/main/db/migrations'
})
