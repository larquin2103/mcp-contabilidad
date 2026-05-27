import sql from 'mssql/msnodesqlv8.js';

const config: any = {
  driver: 'msnodesqlv8',
  connectionString:
    'Driver={SQL Server Native Client 10.0};' +
    'Server=192.168.7.70;Database=FactCAMA2025;UID=sa;PWD=swift;',
};

async function diag() {
  const pool = await new sql.ConnectionPool(config).connect();

  const q = `
    SELECT 'TODO (sin filtrar) - enero' AS Metodo,
           SUM(TOTAL_MN) AS Total, COUNT(*) AS NumDocs
    FROM FACTURA_ENC WHERE PER = '01'
    UNION ALL
    SELECT 'Solo Prefacturas (PF)',
           SUM(TOTAL_MN), COUNT(*)
    FROM FACTURA_ENC WHERE PER = '01' AND CODIGO_TIPOFACTURA = 'PF'
    UNION ALL
    SELECT 'Solo Facturas reales (FC)',
           SUM(TOTAL_MN), COUNT(*)
    FROM FACTURA_ENC WHERE PER = '01' AND CODIGO_TIPOFACTURA = 'FC'
    UNION ALL
    SELECT 'FC sin canceladas',
           SUM(TOTAL_MN), COUNT(*)
    FROM FACTURA_ENC WHERE PER = '01' AND CODIGO_TIPOFACTURA = 'FC' AND Cancelada = 0
    UNION ALL
    SELECT 'FC contabilizadas',
           SUM(TOTAL_MN), COUNT(*)
    FROM FACTURA_ENC WHERE PER = '01' AND CODIGO_TIPOFACTURA = 'FC' AND Contabilizada = 1
  `;

  const r = await pool.request().query(q);

  console.log('DIAGNÓSTICO DE BRECHA — Enero 2025 (PER=01)');
  console.log('='.repeat(70));
  r.recordset.forEach((row: any) => {
    const total = (row.Total || 0).toLocaleString('es-CU', { minimumFractionDigits: 2 });
    console.log(`${row.Metodo.padEnd(32)} ${total.padStart(18)}  (${row.NumDocs} docs)`);
  });
  console.log('='.repeat(70));
  console.log('Contabilizado real (ContaCAMA2025):        1,090,544.00');

  await pool.close();
}

diag();