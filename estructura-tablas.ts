import sql from 'mssql/msnodesqlv8.js';

const config: any = {
  driver: 'msnodesqlv8',
  connectionString:
    'Driver={SQL Server Native Client 10.0};' +
    'Server=192.168.7.70;Database=contaCAMA2025;UID=sa;PWD=swift;',
};

// Tablas núcleo a inspeccionar
const tablas = ['PlanCuentas', 'Mayor', 'Asiento', 'Balance de Comprobación'];

async function inspeccionar() {
  const pool = await new sql.ConnectionPool(config).connect();

  for (const tabla of tablas) {
    console.log('\n========================================');
    console.log('TABLA:', tabla);
    console.log('========================================');

    // Columnas
    const cols = await pool.request().query(`
      SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, IS_NULLABLE
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = '${tabla}'
      ORDER BY ORDINAL_POSITION
    `);
    console.log('\nColumnas:');
    cols.recordset.forEach((c: any) =>
      console.log(`  ${c.COLUMN_NAME.padEnd(30)} ${c.DATA_TYPE}${c.CHARACTER_MAXIMUM_LENGTH ? '(' + c.CHARACTER_MAXIMUM_LENGTH + ')' : ''}`)
    );

    // Conteo
    const cnt = await pool.request().query(`SELECT COUNT(*) AS total FROM [${tabla}]`);
    console.log('\nRegistros:', cnt.recordset[0].total);

    // Muestra
    const sample = await pool.request().query(`SELECT TOP 2 * FROM [${tabla}]`);
    console.log('\nMuestra (2 filas):');
    console.log(JSON.stringify(sample.recordset, null, 2));
  }

  await pool.close();
}

inspeccionar();