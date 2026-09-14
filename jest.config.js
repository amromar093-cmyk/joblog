/** @type {import('jest').Config} */
// Unit tests only — no DB required, safe to run anywhere including a laptop
// with no Postgres installed. See jest.integration.config.js for the suite
// that exercises real routes against a real database.
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  // explicit rather than relying on the default (which also matches any file
  // under a __tests__ dir, including setup.ts and the integration helpers)
  testMatch: ["<rootDir>/src/**/*.test.ts"],
  testPathIgnorePatterns: ["/node_modules/", "/dist/", "/src/__tests__/integration/"],
  setupFilesAfterEnv: ["<rootDir>/src/__tests__/setup.ts"],
};
