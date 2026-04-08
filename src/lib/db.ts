import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";

import { serverEnv } from "@/lib/env";

declare global {
  var clickyPrismaClient: PrismaClient | undefined;
  var clickyPostgresPool: Pool | undefined;
}

const postgresPool =
  globalThis.clickyPostgresPool ??
  new Pool({
    connectionString: serverEnv.DATABASE_URL,
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.clickyPostgresPool = postgresPool;
}

export const prisma =
  globalThis.clickyPrismaClient ??
  new PrismaClient({
    adapter: new PrismaPg(postgresPool),
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.clickyPrismaClient = prisma;
}
