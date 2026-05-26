import sql from 'mssql/msnodesqlv8.js';

const config: any = {
  driver: 'msnodesqlv8',
  connectionString:
    'Driver={SQL Server Native Client 10.0};' +
    'Server=192.168.7.70;Database=contaCAMA2025;UID=sa;PWD=swift;',
};

async function buscar() {
  const pool = await new sql.ConnectionPool(config).connect();

  // Ver estructura de Clasificador de Cuentas_1 (probable catálogo)
  for (const tabla of ['Clasificador de Cuentas_1', 'Clasificador de Cuentas Auxiliar', 'PlanElementos']) {
    console.log('\n======', tabla, '======');
    try {
      const cols = await pool.request().query(`
        SELECT COLUMN_NAME, DATA_TYPE
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME = '${tabla}'
        ORDER BY ORDINAL_POSITION
      `);
      cols.recordset.forEach((c: any) => console.log(' ', c.COLUMN_NAME, '-', c.DATA_TYPE));

      const cnt = await pool.request().query(`SELECT COUNT(*) AS t FROM [${tabla}]`);
      console.log('  Registros:', cnt.recordset[0].t);

      const m = await pool.request().query(`SELECT TOP 3 * FROM [${tabla}]`);
      console.log('  Muestra:', JSON.stringify(m.recordset, null, 2));
    } catch (e: any) {
      console.log('  Error:', e.message);
    }
  }

  await pool.close();
}

buscar();