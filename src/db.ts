import sql from 'mssql/msnodesqlv8.js';
import dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../config/.env') });

// ── Configuración de servidores ───────────────────────────────────
// Cada servidor tiene su propio bloque en el .env:
//   DB_SERVER_PRINCIPAL, DB_PORT_PRINCIPAL, DB_USER_PRINCIPAL, DB_PASSWORD_PRINCIPAL
//   DB_SERVER_AG,        DB_PORT_AG,        DB_USER_AG,        DB_PASSWORD_AG
//   DB_SERVER_FEF,       DB_PORT_FEF,       DB_USER_FEF,       DB_PASSWORD_FEF

interface ServerConfig {
  ip:       string;
  port:     string;
  usuario:  string;
  password: string;
}

function leerConfigServidor(clave: string): ServerConfig {
  const k = clave.toUpperCase();
  return {
    ip:       process.env[`DB_SERVER_${k}`]   ?? '127.0.0.1',
    port:     process.env[`DB_PORT_${k}`]     ?? '1433',
    usuario:  process.env[`DB_USER_${k}`]     ?? 'sa',
    password: process.env[`DB_PASSWORD_${k}`] ?? '',
  };
}

// ── Mapa agencia → clave de servidor (desde agencias.json) ────────
const agenciasCfg: Record<string, { servidor: string }> = (() => {
  const raw = JSON.parse(
    readFileSync(join(__dirname, '../config/agencias.json'), 'utf-8')
  );
  return raw.agencias ?? {};
})();

/** Resuelve la clave de servidor a partir del nombre de la BD. */
export function resolverClaveServidor(database: string): string {
  const upper = database.toUpperCase();
  for (const [codigo, cfg] of Object.entries(agenciasCfg)) {
    if (upper.includes(codigo.toUpperCase())) {
      return cfg.servidor ?? 'principal';
    }
  }
  return 'principal';
}

function buildConnectionString(database: string, srv: ServerConfig): string {
  // SQL Server 2000 acepta mejor la IP sola cuando es el puerto estándar.
  // Solo se añade ,puerto si es diferente de 1433.
  const serverStr = srv.port === '1433' ? srv.ip : `${srv.ip},${srv.port}`;
  return (
    `Driver={SQL Server Native Client 10.0};` +
    `Server=${serverStr};` +
    `Database=${database};` +
    `UID=${srv.usuario};` +
    `PWD=${srv.password};`
  );
}

// ── Pool cache — clave = "claveServidor:bd" ───────────────────────
// Incluir el servidor en la clave evita colisiones si dos servidores
// tienen una BD con el mismo nombre.
const pools = new Map<string, sql.ConnectionPool>();

/**
 * Devuelve (o crea) el pool para la BD indicada.
 * @param database   Nombre de la BD (ej: "ContaCAMA2025", "AGConta2025")
 * @param serverKey  Clave de servidor opcional; si se omite se infiere por agencia
 */
export async function getPool(
  database  = 'master',
  serverKey?: string,
): Promise<sql.ConnectionPool> {
  const claveServidor = serverKey ?? resolverClaveServidor(database);
  const poolKey       = `${claveServidor}:${database}`;

  const existing = pools.get(poolKey);
  if (existing?.connected) return existing;
  if (existing) pools.delete(poolKey);   // reconectar si se cayó

  const srv = leerConfigServidor(claveServidor);

  // msnodesqlv8 acepta connectionString en lugar del config estándar de mssql.
  // El tipo sql.config no declara connectionString, por eso se usa any.
  const config: any = {
    driver:            'msnodesqlv8',
    connectionString:  buildConnectionString(database, srv),
    connectionTimeout: parseInt(process.env.DB_CONNECT_TIMEOUT ?? '15000', 10),
    requestTimeout:    parseInt(process.env.DB_REQUEST_TIMEOUT  ?? '30000', 10),
    pool: {
      max:               10,
      min:               0,
      idleTimeoutMillis: 30000,
    },
  };

  const pool = await new sql.ConnectionPool(config).connect();
  pools.set(poolKey, pool);
  return pool;
}

// ── Verificar si una BD existe en su servidor ─────────────────────
// Conecta al master del mismo servidor donde viviría la BD consultada.
export async function dbExiste(nombre: string): Promise<boolean> {
  try {
    const claveServidor = resolverClaveServidor(nombre);
    const pool = await getPool('master', claveServidor);
    const result = await pool.request()
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
