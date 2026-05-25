import sql from 'mssql';
import dotenv from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../config/.env') });

// ── Config base (sin BD específica) ──────────────────────────────
const BASE_CONFIG: sql.config = {
  server:  process.env.DB_SERVER!,
  user:    process.env.DB_USER!,
  password: process.env.DB_PASSWORD!,
  options: {
    encrypt:                false,
    trustServerCertificate: true,
    enableArithAbort:       true,
    readOnlyIntent:         true,   // 🔒 Solo lectura
  },
  port:             parseInt(process.env.DB_PORT || '1433'),
  connectionTimeout: parseInt(process.env.DB_CONNECT_TIMEOUT || '15000'),
  requestTimeout:    parseInt(process.env.DB_REQUEST_TIMEOUT || '30000'),
};

// ── Pool cache (evitar reconexiones innecesarias) ─────────────────
const pools = new Map<string, sql.ConnectionPool>();

export async function getPool(database?: string): Promise<sql.ConnectionPool> {
  const key = database ?? '__master__';

  const existing = pools.get(key);
  if (existing?.connected) return existing;
  if (existing) pools.delete(key);  // reconectar si se cayó

  const config: sql.config = {
    ...BASE_CONFIG,
    ...(database ? { database } : {}),
  };

  const pool = await new sql.ConnectionPool(config).connect();
  pools.set(key, pool);
  return pool;
}

// ── Verificar si una BD existe y está accesible ───────────────────
export async function dbExiste(nombre: string): Promise<boolean> {
  try {
    const master = await getPool();
    const result = await master.request()
      .input('nombre', nombre)
      .query(`
        SELECT COUNT(1) AS existe
        FROM sys.databases
        WHERE name = @nombre AND state_desc = 'ONLINE'
      `);
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
