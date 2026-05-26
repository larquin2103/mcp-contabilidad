import sql from 'mssql/msnodesqlv8.js';

const config: any = {
  driver: 'msnodesqlv8',
  connectionString:
    'Driver={SQL Server Native Client 10.0};' +
    'Server=192.168.7.70;Database=FactCAMA2025;UID=sa;PWD=swift;',
};

async function inspeccionar() {
  const pool = await new sql.ConnectionPool(config).connect();

  // 1. Listar todas las tablas
  const tablas = await pool.request().query(
    "SELECT name FROM sysobjects WHERE xtype = char(85) ORDER BY name"
  );
  console.log('TABLAS EN FactCAMA2025:', tablas.recordset.length);
  console.log('='.repeat(50));
  tablas.recordset.forEach((t: any) => console.log(' -', t.name));

  await pool.close();
}

inspeccionar();