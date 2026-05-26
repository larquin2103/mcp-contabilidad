import sql from 'mssql/msnodesqlv8.js';

const config: any = {
  driver: 'msnodesqlv8',
  connectionString:
    'Driver={SQL Server Native Client 10.0};' +
    'Server=192.168.7.70;Database=contaCAMA2025;UID=sa;PWD=swift;',
};

async function explorar() {
  const pool = await new sql.ConnectionPool(config).connect();
  const r = await pool.request().query(
    "SELECT name FROM sysobjects WHERE xtype='U' ORDER BY name"
  );
  console.log('Tablas en contaCAMA2025:', r.recordset.length);
  console.log('================================');
  r.recordset.forEach((row: any) => console.log(' -', row.name));
  await pool.close();
}

explorar();