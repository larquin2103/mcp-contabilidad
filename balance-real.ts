import sql from 'mssql/msnodesqlv8.js';

const config: any = {
  driver: 'msnodesqlv8',
  connectionString:
    'Driver={SQL Server Native Client 10.0};' +
    'Server=192.168.7.70;Database=contaCAMA2025;UID=sa;PWD=swift;',
};

async function balance() {
  const pool = await new sql.ConnectionPool(config).connect();

  // Balance de saldos por cuenta CON nombres, último período de cada cuenta
  const r = await pool.request().query(`
    SELECT
      m.Cuenta,
      c.Descripción AS Nombre,
      c.Naturaleza,
      MAX(m.Período) AS Periodo,
      SUM(m.[Débito])  AS Debito,
      SUM(m.[Crédito]) AS Credito,
      SUM(m.[Débito]) - SUM(m.[Crédito]) AS Saldo
    FROM Mayor m
    LEFT JOIN [Clasificador de Cuentas_1] c
      ON m.Cuenta = c.Cuenta AND m.SubCuenta = c.SubCuenta
    GROUP BY m.Cuenta, c.Descripción, c.Naturaleza
    HAVING ABS(SUM(m.[Débito]) - SUM(m.[Crédito])) > 1
    ORDER BY ABS(SUM(m.[Débito]) - SUM(m.[Crédito])) DESC
  `);

  console.log('BALANCE DE SALDOS — contaCAMA2025 (TOP 20)');
  console.log('='.repeat(70));
  r.recordset.slice(0, 20).forEach((c: any) => {
    const nombre = (c.Nombre || '(sin nombre)').substring(0, 35);
    const saldo = c.Saldo.toLocaleString('es-CU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    console.log(`${c.Cuenta.padEnd(6)} ${nombre.padEnd(37)} ${saldo.padStart(20)}`);
  });

  // Totales de control
  const tot = await pool.request().query(`
    SELECT
      SUM([Débito])  AS TotalDebito,
      SUM([Crédito]) AS TotalCredito
    FROM Mayor
  `);
  const t = tot.recordset[0];
  console.log('='.repeat(70));
  console.log('Total Débito: ', t.TotalDebito.toLocaleString('es-CU', { minimumFractionDigits: 2 }));
  console.log('Total Crédito:', t.TotalCredito.toLocaleString('es-CU', { minimumFractionDigits: 2 }));
  console.log('Diferencia:   ', (t.TotalDebito - t.TotalCredito).toLocaleString('es-CU', { minimumFractionDigits: 2 }));

  await pool.close();
}

balance();