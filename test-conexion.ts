import sql from 'mssql/msnodesqlv8.js';

const config: any = {
  server:   '192.168.7.70',
  user:     'sa',
  password: 'swift',
  driver:   'msnodesqlv8',
  options: {
    trustedConnection: false,
    encrypt:           false,
  },
  // Connection string estilo ODBC con Native Client 10.0
  connectionString:
    'Driver={SQL Server Native Client 10.0};' +
    'Server=192.168.7.70;' +
    'Database=master;' +
    'UID=sa;PWD=swift;',
};

async function test() {
  try {
    console.log('Conectando via ODBC Native Client...');
    const pool = await new sql.ConnectionPool(config).connect();
    const r = await pool.request()
      .query('SELECT name FROM sysdatabases ORDER BY name');
    console.log('✅ Conexion exitosa!');
    r.recordset.forEach((row: any) => console.log(' -', row.name));
    await pool.close();
  } catch (err: any) {
    console.error('❌ Error:', err.message);
  }
}

test();