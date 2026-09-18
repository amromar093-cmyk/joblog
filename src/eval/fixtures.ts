/** Golden fixtures for `npm run eval`. Hand-written, not generated — each
 *  one encodes a judgment call about what a "correct" result looks like, so
 *  it has to come from a person, not the model being graded. */

export type MatchFixture = {
  name: string;
  resumeBullets: string[];
  jobDescription: string;
  /** Skills the posting clearly asks for that ARE backed by a resume
   *  bullet — the matcher should find these. */
  expectMatched: string[];
  /** Skills the posting asks for that are NOT backed by any bullet — the
   *  matcher should NOT claim these are covered. */
  expectMissing: string[];
};

export const matchFixtures: MatchFixture[] = [
  {
    name: "backend role, resume covers most of it",
    resumeBullets: [
      "Built and shipped REST APIs in Node.js and Express, backed by PostgreSQL via Prisma.",
      "Wrote unit and integration tests with Jest, including a CI pipeline on GitHub Actions.",
      "Implemented JWT-based authentication and role-scoped authorization for a multi-tenant API.",
    ],
    jobDescription: `We're hiring a Backend Engineer to help build our core API.
Requirements: strong Node.js and TypeScript experience, PostgreSQL, experience writing automated tests.
Nice to have: Kubernetes, GraphQL, experience with event-driven architectures (Kafka/SQS).`,
    expectMatched: ["Node.js", "PostgreSQL", "automated tests"],
    expectMissing: ["Kubernetes", "GraphQL"],
  },
  {
    name: "mobile role, resume is backend-only — should NOT overclaim",
    resumeBullets: [
      "Built and shipped REST APIs in Node.js and Express, backed by PostgreSQL via Prisma.",
      "Wrote unit and integration tests with Jest, including a CI pipeline on GitHub Actions.",
    ],
    jobDescription: `We're hiring a Senior React Native Engineer.
Requirements: 3+ years React Native, experience with Expo, published apps on the App Store.
Nice to have: Swift/Kotlin native module experience.`,
    expectMatched: [],
    expectMissing: ["React Native", "Expo", "App Store"],
  },
];

export type CoverLetterFixture = {
  name: string;
  resumeBullets: string[];
  company: string;
  role: string;
  jobDescription: string;
};

export const coverLetterFixtures: CoverLetterFixture[] = [
  {
    name: "backend role with a clean resume match",
    resumeBullets: [
      "Built and shipped REST APIs in Node.js and Express, backed by PostgreSQL via Prisma.",
      "Wrote unit and integration tests with Jest, including a CI pipeline on GitHub Actions that runs against a real ephemeral Postgres.",
      "Implemented JWT-based authentication and ownership-scoped authorization for a multi-tenant API.",
    ],
    company: "Acme Systems",
    role: "Backend Engineer",
    jobDescription: "Backend Engineer to build our core API — Node.js, TypeScript, PostgreSQL, automated testing.",
  },
];
