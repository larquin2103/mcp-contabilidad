import sql from 'mssql/msnodesqlv8.js';

const config: any = {
  driver: 'msnodesqlv8',
  connectionString:
    'Driver={SQL Server Native Client 10.0};' +
    'Server=192.168.7.70;Database=contaCAMA2025;UID=sa;PWD=swift;',
};

async function diag() {
  const pool = await new sql.ConnectionPool(config).connect();

  // ¿Cómo se ve la cuenta 901 en el catálogo? ¿Una o varias descripciones?
  console.log('====== 901 en el catálogo (todas sus subcuentas) ======');
  const cat = await pool.request().query(`
    SELECT Cuenta, SubCuenta, Descripción, Naturaleza
    FROM [Clasificador de Cuentas_1]
    WHERE Cuenta = '901'
  `);
  console.table(cat.recordset);

  // Replicar EXACTAMENTE el GROUP BY de balance-real.ts para 901/903
  console.log('\n====== Replica del balance-real para ventas ======');
  const bal = await pool.request().query(`
    SELECT
      m.Cuenta,
      c.Descripción AS Nombre,
      SUM(m.[Débito]) - SUM(m.[Crédito]) AS Saldo
    FROM Mayor m
    LEFT JOIN [Clasificador de Cuentas_1] c
      ON m.Cuenta = c.Cuenta AND m.SubCuenta = c.SubCuenta
    WHERE m.Cuenta IN ('900','901','902','903','999')
    GROUP BY m.Cuenta, c.Descripción
    ORDER BY m.Cuenta
  `);
  console.table(bal.recordset.map((r: any) => ({
    Cuenta: r.Cuenta,
    Nombre: (r.Nombre || '(null)').substring(0, 30),
    Saldo: (r.Saldo || 0).toLocaleString('es-CU'),
  })));

  // ¿Hay cuenta 999 de cierre que refleje las ventas otra vez?
  console.log('\n====== Cuenta 999 (cierre) — ¿refleja ventas? ======');
  const cierre = await pool.request().query(`
    SELECT Cuenta, SubCuenta, SUM([Débito]) AS D, SUM([Crédito]) AS C
    FROM Mayor WHERE Cuenta = '999'
    GROUP BY Cuenta, SubCuenta
  `);
  console.table(cierre.recordset);

  await pool.close();
}

diag();