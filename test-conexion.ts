import sql from 'mssql/msnodesqlv8.js';
import dotenv from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, 'config/.env') });

interface ServidorTest {
  clave:    string;
  ip:       string;
  port:     string;
  usuario:  string;
  password: string;
}

const servidores: ServidorTest[] = [
  {
    clave:    'PRINCIPAL',
    ip:       process.env.DB_SERVER_PRINCIPAL   ?? '',
    port:     process.env.DB_PORT_PRINCIPAL     ?? '1433',
    usuario:  process.env.DB_USER_PRINCIPAL     ?? 'sa',
    password: process.env.DB_PASSWORD_PRINCIPAL ?? '',
  },
  {
    clave:    'AG',
    ip:       process.env.DB_SERVER_AG   ?? '',
    port:     process.env.DB_PORT_AG     ?? '1433',
    usuario:  process.env.DB_USER_AG     ?? 'sa',
    password: process.env.DB_PASSWORD_AG ?? '',
  },
  {
    clave:    'FEF',
    ip:       process.env.DB_SERVER_FEF   ?? '',
    port:     process.env.DB_PORT_FEF     ?? '1433',
    usuario:  process.env.DB_USER_FEF     ?? 'sa',
    password: process.env.DB_PASSWORD_FEF ?? '',
  },
];

async function testServidor(s: ServidorTest): Promise<void> {
  console.log(`\n── ${s.clave} (${s.ip}:${s.port}) ──────────────────────`);

  // SQL Server 2000 acepta mejor la IP sola sin puerto en el connection string
  // cuando se usa el puerto estándar 1433. Si el puerto es diferente, se añade.
  const serverStr = s.port === '1433' ? s.ip : `${s.ip},${s.port}`;

  const config: any = {
    driver: 'msnodesqlv8',
    connectionString:
      `Driver={SQL Server Native Client 10.0};` +
      `Server=${serverStr};` +
      `Database=master;` +
      `UID=${s.usuario};PWD=${s.password};`,
    connectionTimeout: 10000,
    requestTimeout:    10000,
  };

  const inicio = Date.now();
  try {
    const pool = await new sql.ConnectionPool(config).connect();
    const r = await pool.request()
      .query('SELECT name FROM master..sysdatabases ORDER BY name');
    const ms = Date.now() - inicio;
    console.log(`✅ Conectado en ${ms}ms — ${r.recordset.length} bases de datos:`);
    r.recordset.forEach((row: any) => console.log(`   - ${row.name}`));
    await pool.close();
  } catch (err: any) {
    const ms = Date.now() - inicio;
    console.error(`❌ Error tras ${ms}ms: ${err.message}`);
  }
}

async function main() {
  console.log('=== Test de conexión multi-servidor ===');
  for (const s of servidores) {
    await testServidor(s);
  }
  console.log('\n=== Fin del test ===');
}

main();
