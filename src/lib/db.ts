import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { Pool, type PoolConfig } from "pg";

import { serverEnv } from "@/lib/env";

declare global {
  var clickyPrismaClient: PrismaClient | undefined;
  var clickyPostgresPool: Pool | undefined;
}

function shouldUseTlsForDatabaseConnection(databaseUrl: URL): boolean {
  const sslMode = databaseUrl.searchParams.get("sslmode");

  if (sslMode) {
    return sslMode !== "disable";
  }

  const sslSearchParameterValue = databaseUrl.searchParams.get("ssl");

  return sslSearchParameterValue === "true" || sslSearchParameterValue === "1";
}

function buildPostgresPoolConfiguration(): PoolConfig {
  const databaseUrl = new URL(serverEnv.DATABASE_URL);
  const databaseRequiresTransportSecurity =
    shouldUseTlsForDatabaseConnection(databaseUrl);

  if (!serverEnv.DATABASE_CA_CERT && !databaseRequiresTransportSecurity) {
    return {
      connectionString: serverEnv.DATABASE_URL,
    };
  }

  const databaseUrlWithoutSslParameters = new URL(serverEnv.DATABASE_URL);

  // When SSL settings are present in the connection string, node-postgres ignores
  // the explicit ssl object we pass below. Removing them lets us enforce the
  // managed database CA certificate without weakening TLS verification.
  for (const sslSearchParameterName of [
    "ssl",
    "sslcert",
    "sslkey",
    "sslmode",
    "sslrootcert",
  ]) {
    databaseUrlWithoutSslParameters.searchParams.delete(sslSearchParameterName);
  }

  return {
    connectionString: databaseUrlWithoutSslParameters.toString(),
    ssl: serverEnv.DATABASE_CA_CERT
      ? {
          rejectUnauthorized: true,
          ca: serverEnv.DATABASE_CA_CERT.replace(/\\n/g, "\n"),
        }
      : {
          // Some managed Postgres providers expose self-signed certificate chains
          // without separately providing the CA bundle. This keeps TLS enabled so
          // production can connect, but it skips certificate verification.
          rejectUnauthorized: false,
        },
  };
}

const postgresPool =
  globalThis.clickyPostgresPool ??
  new Pool(buildPostgresPoolConfiguration());

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
