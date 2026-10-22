import { PrismaClient } from "@prisma/client";

/**
 * Prisma is a singleton per process. On Vercel, Fluid compute reuses instances
 * between invocations, so keeping the client on `globalThis` avoids opening a
 * new pool on every request. Connection pooling itself is handled by Neon's
 * PgBouncer endpoint (`DATABASE_URL`); migrations use `DATABASE_URL_UNPOOLED`.
 */
const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

globalForPrisma.prisma = prisma;
