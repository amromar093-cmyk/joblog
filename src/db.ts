import { PrismaClient } from "@prisma/client";

// One client for the process's whole lifetime — Prisma pools connections
// internally, so a fresh client per request would exhaust the DB's
// connection limit under any real load.
export const prisma = new PrismaClient();
