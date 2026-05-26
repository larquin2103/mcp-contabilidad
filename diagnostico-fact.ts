import sql from 'mssql/msnodesqlv8.js';

const config: any = {
  driver: 'msnodesqlv8',
  connectionString:
    'Driver={SQL Server Native Client 10.0};' +
    'Server=192.168.7.70;Database=FactCAMA2025;UID=sa;PWD=swift;',
};

async function diag() {
  const pool = await new sql.ConnectionPool(config).connect();

  // Columnas de FACTURA_ENC
  console.log('====== COLUMNAS DE FACTURA_ENC ======');
  const cols = await pool.request().query(`
    SELECT COLUMN_NAME, DATA_TYPE
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'FACTURA_ENC'
    ORDER BY ORDINAL_POSITION
  `);
  cols.recordset.forEach((c: any) => console.log(' ', c.COLUMN_NAME, '-', c.DATA_TYPE));

  // Muestra de 2 facturas
  console.log('\n====== MUESTRA (2 facturas) ======');
  const m = await pool.request().query('SELECT TOP 2 * FROM FACTURA_ENC');
  console.log(JSON.stringify(m.recordset, null, 2));

  // Tipos de factura disponibles
  console.log('\n====== TIPOS DE FACTURA ======');
  const tipos = await pool.request().query('SELECT * FROM [TIPOS DE FACTURA]');
  console.log(JSON.stringify(tipos.recordset, null, 2));

  await pool.close();
}

diag();