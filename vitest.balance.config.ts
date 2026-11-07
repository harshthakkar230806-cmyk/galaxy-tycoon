import { defineConfig } from 'vitest/config';

// Dev-only balance simulation: a bot plays the whole game headlessly and prints a milestone timeline.
//   BOT_SEED=777 BOT_HOURS=20 npm run balance
export default defineConfig({
  test: { environment: 'node', include: ['tests/balance/*.sim.ts'], testTimeout: 900000 },
});
