import sql from 'mssql/msnodesqlv8.js';
import dotenv from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../config/.env') });

// ── Connection string por BD ──────────────────────────────────────
// SQL Server 2000 via ODBC / Native Client 10.0. Cada pool
// lleva su propia BD en el connection string; no se usa USE [db].

function buildConnectionString(database: string): string {
  const server   = process.env.DB_SERVER   ?? '127.0.0.1';
  const user     = process.env.DB_USER     ?? 'sa';
  const password = process.env.DB_PASSWORD ?? '';
  return (
    `Driver={SQL Server Native Client 10.0};` +
    `Server=${server};` +
    `Database=${database};` +
    `UID=${user};` +
    `PWD=${password};`
  );
}

const POOL_OPTIONS: Pick<sql.config, 'connectionTimeout' | 'requestTimeout' | 'pool'> = {
  connectionTimeout: 15000,
  requestTimeout:    30000,
  pool: {
    max:               10,
    min:               0,
    idleTimeoutMillis: 30000,
  },
};

// ── Pool cache — una entrada por BD ──────────────────────────────
const pools = new Map<string, sql.ConnectionPool>();

export async function getPool(database = 'master'): Promise<sql.ConnectionPool> {
  const existing = pools.get(database);
  if (existing?.connected) return existing;
  if (existing) pools.delete(database);   // reconectar si se cayó

  const pool = await new sql.ConnectionPool({
    ...POOL_OPTIONS,
    connectionString: buildConnectionString(database),
  }).connect();

  pools.set(database, pool);
  return pool;
}

// ── Verificar si una BD existe en el servidor ─────────────────────
// Usa master..sysdatabases (SQL Server 2000 compatible).
export async function dbExiste(nombre: string): Promise<boolean> {
  try {
    const master = await getPool('master');
    const result = await master.request()
      .input('nombre', nombre)
      .query(`SELECT COUNT(1) AS existe FROM master..sysdatabases WHERE name = @nombre`);
    return result.recordset[0].existe === 1;
  } catch {
    return false;
  }
}

// ── Cerrar todas las conexiones al terminar ───────────────────────
export async function cerrarConexiones(): Promise<void> {
  for (const [key, pool] of pools) {
    await pool.close().catch(() => {});
    pools.delete(key);
  }
}

process.on('SIGINT',  () => cerrarConexiones().then(() => process.exit(0)));
process.on('SIGTERM', () => cerrarConexiones().then(() => process.exit(0)));
