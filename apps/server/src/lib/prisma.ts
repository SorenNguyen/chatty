import { PrismaClient } from "@prisma/client";

/**
 * A single shared Prisma client for the whole process. Prisma manages its
 * own connection pool internally — creating a new PrismaClient per request
 * would exhaust Postgres connections under load.
 */
export const prisma = new PrismaClient();
