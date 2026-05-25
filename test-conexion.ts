import sql from 'mssql';

const config = {
  server:   'GEOSQL2K',    // nombre del servidor
  user:     'sa',
  password: 'swift',
  port:     1433,
  options: {
    encrypt:                false,
    trustServerCertificate: false,
    enableArithAbort:       true,
    useUTC:                 false,
    // Compatibilidad SQL Server 2000
    tdsVersion:             '7_1',
  },
  connectionTimeout: 15000,
};

async function test() {
  try {
    console.log('Conectando a GEOSQL2K...');
    const pool = await new sql.ConnectionPool(config).connect();
    const result = await pool.request().query(
      'SELECT name FROM sysdatabases ORDER BY name'
    );
    console.log('✅ Conexion exitosa!');
    result.recordset.forEach((r: any) => console.log(' -', r.name));
    await pool.close();
  } catch (err: any) {
    console.error('❌ Error:', err.message);
  }
}

test();