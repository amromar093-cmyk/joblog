/** @type {import('jest').Config} */
// Hits real Express routes with supertest against a real Postgres —
// DATABASE_URL must point at one with the schema already pushed
// (`npx prisma db push`). CI does both automatically; see README for local
// setup.
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: ["<rootDir>/src/__tests__/integration/**/*.test.ts"],
  setupFilesAfterEnv: ["<rootDir>/src/__tests__/setup.ts"],
  // route + Prisma round-trips are slower than unit tests; one worker avoids
  // several test files racing to truncate the same tables at once
  maxWorkers: 1,
};
