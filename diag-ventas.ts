import sql from 'mssql/msnodesqlv8.js';

const config: any = {
  driver: 'msnodesqlv8',
  connectionString:
    'Driver={SQL Server Native Client 10.0};' +
    'Server=192.168.7.70;Database=contaCAMA2025;UID=sa;PWD=swift;',
};

async function diag() {
  const pool = await new sql.ConnectionPool(config).connect();

  // 1. Mayor crudo de una cuenta de venta (901/903/900)
  console.log('====== MAYOR CRUDO — cuentas de venta (sin JOIN) ======');
  const crudo = await pool.request().query(`
    SELECT Cuenta, SubCuenta, Período,
           SUM([Débito]) AS Debito, SUM([Crédito]) AS Credito
    FROM Mayor
    WHERE Cuenta IN ('900','901','902','903')
    GROUP BY Cuenta, SubCuenta, Período
    ORDER BY Cuenta, SubCuenta, Período
  `);
  console.log('Filas en Mayor:', crudo.recordset.length);
  console.table(crudo.recordset.slice(0, 10));

  // 2. Contar cuántas filas devuelve el catálogo por cuenta/subcuenta
  console.log('\n====== ¿El catálogo tiene duplicados? ======');
  const dupCat = await pool.request().query(`
    SELECT Cuenta, SubCuenta, COUNT(*) AS Veces
    FROM [Clasificador de Cuentas_1]
    WHERE Cuenta IN ('900','901','902','903')
    GROUP BY Cuenta, SubCuenta
    HAVING COUNT(*) > 1
  `);
  if (dupCat.recordset.length === 0) {
    console.log('Catálogo SIN duplicados en cuentas de venta');
  } else {
    console.log('⚠️ CATÁLOGO DUPLICADO — esta es la causa:');
    console.table(dupCat.recordset);
  }

  // 3. Comparar: suma directa de Mayor vs suma con JOIN
  console.log('\n====== Mayor solo vs Mayor + JOIN catálogo ======');
  const soloMayor = await pool.request().query(`
    SELECT SUM([Crédito]) AS VentasCredito
    FROM Mayor WHERE Cuenta IN ('900','901','902','903')
  `);
  const conJoin = await pool.request().query(`
    SELECT SUM(m.[Crédito]) AS VentasCredito
    FROM Mayor m
    LEFT JOIN [Clasificador de Cuentas_1] c
      ON m.Cuenta = c.Cuenta AND m.SubCuenta = c.SubCuenta
    WHERE m.Cuenta IN ('900','901','902','903')
  `);
  console.log('Solo Mayor:    ', (soloMayor.recordset[0].VentasCredito || 0).toLocaleString('es-CU'));
  console.log('Mayor + JOIN:  ', (conJoin.recordset[0].VentasCredito || 0).toLocaleString('es-CU'));

  await pool.close();
}

diag();