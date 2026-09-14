// Runs once per test file, before it's imported — so every module that
// reads `env` (which parses process.env eagerly at import time) sees these
// values already in place.
process.env.JWT_SECRET ||= "test-secret-at-least-16-chars-long";
process.env.NODE_ENV = "test";
// A harmless placeholder so `env.ts` parses even for unit tests that never
// touch Prisma. CI (and anyone running the integration suite) sets a real
// DATABASE_URL beforehand, which this never overrides.
process.env.DATABASE_URL ||= "postgresql://user:pass@localhost:5432/joblog_test";
