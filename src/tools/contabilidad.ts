import { getPool } from '../db.js';

// ── Mapa de grupos del Plan de Cuentas cubano ─────────────────────
// Primer dígito del código de cuenta → sección del balance
const GRUPO_NOMBRE: Record<string, string> = {
  '1': 'Activos',
  '2': 'Activos',
  '3': 'Inventarios',
  '4': 'Pasivos / Patrimonio',
  '5': 'Patrimonio',
  '6': 'Resultados',
  '7': 'Ingresos',
};

export const contabilidadTools = [
  {
    name: 'balance_saldos',
    description: `Saldos del libro Mayor con nombre de cuenta y verificación de cuadre
(partida doble: total débito = total crédito).
Por defecto agrupa por cuenta (suma todas sus subcuentas).
Con agrupar_por='subcuenta' devuelve el detalle por subcuenta.
Requiere una BD Conta: ContaCAMA2025, ContaANAV2026, etc.`,
    inputSchema: {
      type: 'object',
      properties: {
        base_datos: {
          type: 'string',
          description: 'BD del módulo Conta. Ej: ContaCAMA2025',
        },
        agrupar_por: {
          type: 'string',
          enum: ['cuenta', 'subcuenta'],
          description: 'Nivel de agrupación (por defecto: cuenta)',
          default: 'cuenta',
        },
      },
      required: ['base_datos'],
    },
  },
  {
    name: 'saldo_cuenta',
    description: `Detalle de una cuenta contable: todas sus subcuentas y períodos con
débito, crédito y acumulados mes a mes (Período 0=apertura, 1-12=meses).`,
    inputSchema: {
      type: 'object',
      properties: {
        base_datos: { type: 'string', description: 'Ej: ContaCAMA2025' },
        cuenta:     { type: 'string', description: 'Código de cuenta. Ej: 101, 5010' },
      },
      required: ['base_datos', 'cuenta'],
    },
  },
  {
    name: 'estado_situacion',
    description: `Estado de situación financiera (balance general) clasificado por grupo:
1-2 Activos · 3 Inventarios · 4 Pasivos/Patrimonio · 5 Patrimonio
6 Resultados · 7 Ingresos.
Incluye resumen de totales por sección para verificar la ecuación patrimonial.`,
    inputSchema: {
      type: 'object',
      properties: {
        base_datos: { type: 'string', description: 'Ej: ContaCAMA2025' },
      },
      required: ['base_datos'],
    },
  },
  {
    name: 'ventas_periodo',
    description: `Ventas devengadas: SUM(Crédito) de cuentas 901/903 del Mayor.
NOTA CRÍTICA: las cuentas 900/901/902/903 se cierran contra 999 al fin del ejercicio.
Saldo CERO en esas cuentas = cierre CORRECTO, no es un error ni datos faltantes.
Para ver las ventas del período usar el crédito acumulado de 901/903 (este tool),
no el saldo final de la cuenta (que queda en cero tras el cierre).
Requiere BD Conta: ContaCAMA2025, ContaANAV2025, etc.`,
    inputSchema: {
      type: 'object',
      properties: {
        base_datos: { type: 'string', description: 'Ej: ContaCAMA2025' },
        periodo:    { type: 'number', description: 'Período 1-12. Si se omite, suma todos.' },
      },
      required: ['base_datos'],
    },
  },
  {
    name: 'comparar_periodos',
    description: `Evolución de saldos acumulados entre dos períodos del mismo año.
Período 0 = apertura, 1-12 = enero–diciembre.
Usa [Débito Acumulado] / [Crédito Acumulado] del Mayor para saldos a la fecha.
Para comparar años distintos, llamar dos veces con diferentes base_datos.`,
    inputSchema: {
      type: 'object',
      properties: {
        base_datos: { type: 'string', description: 'Ej: ContaCAMA2025' },
        periodo_a:  { type: 'number', description: 'Período base (0-12). Ej: 0' },
        periodo_b:  { type: 'number', description: 'Período de comparación (0-12). Ej: 6' },
      },
      required: ['base_datos', 'periodo_a', 'periodo_b'],
    },
  },
];

export async function ejecutarContabilidad(name: string, args: any): Promise<string> {

  // ── balance_saldos ──────────────────────────────────────────────
  if (name === 'balance_saldos') {
    const { base_datos, agrupar_por = 'cuenta' } = args;
    const pool = await getPool(base_datos);

    let rows: any[];

    if (agrupar_por === 'subcuenta') {
      const result = await pool.request().query(`
        SELECT
            m.Cuenta,
            m.SubCuenta,
            cc.[Descripción]                   AS Nombre,
            cc.Naturaleza,
            cc.[Grupo Clase]                   AS GrupoClase,
            SUM(m.[Débito])                    AS TotalDebito,
            SUM(m.[Crédito])                   AS TotalCredito,
            SUM(m.[Débito]) - SUM(m.[Crédito]) AS Saldo
        FROM [Mayor] m
        JOIN [Clasificador de Cuentas_1] cc
            ON cc.Cuenta = m.Cuenta AND cc.SubCuenta = m.SubCuenta
        GROUP BY m.Cuenta, m.SubCuenta,
                 cc.[Descripción], cc.Naturaleza, cc.[Grupo Clase]
        ORDER BY m.Cuenta, m.SubCuenta
      `);
      rows = result.recordset;
    } else {
      const result = await pool.request().query(`
        SELECT
            m.Cuenta,
            MIN(cc.[Descripción])              AS Nombre,
            MIN(cc.Naturaleza)                 AS Naturaleza,
            MIN(cc.[Grupo Clase])              AS GrupoClase,
            SUM(m.[Débito])                    AS TotalDebito,
            SUM(m.[Crédito])                   AS TotalCredito,
            SUM(m.[Débito]) - SUM(m.[Crédito]) AS Saldo
        FROM [Mayor] m
        JOIN [Clasificador de Cuentas_1] cc
            ON cc.Cuenta = m.Cuenta AND cc.SubCuenta = m.SubCuenta
        GROUP BY m.Cuenta
        ORDER BY m.Cuenta
      `);
      rows = result.recordset;
    }

    const totalDebito  = rows.reduce((s: number, r: any) => s + (r.TotalDebito  ?? 0), 0);
    const totalCredito = rows.reduce((s: number, r: any) => s + (r.TotalCredito ?? 0), 0);
    const diferencia   = Math.abs(totalDebito - totalCredito);

    return JSON.stringify({
      base_datos,
      agrupar_por,
      total_cuentas: rows.length,
      cuadre: {
        total_debito:  totalDebito,
        total_credito: totalCredito,
        diferencia,
        cuadrado:      diferencia < 0.01,
      },
      saldos: rows,
    }, null, 2);
  }

  // ── saldo_cuenta ────────────────────────────────────────────────
  if (name === 'saldo_cuenta') {
    const { base_datos, cuenta } = args;
    const pool = await getPool(base_datos);

    const result = await pool.request()
      .input('cuenta', cuenta)
      .query(`
        SELECT
            m.Cuenta,
            m.SubCuenta,
            cc.[Descripción]         AS Nombre,
            cc.Naturaleza,
            m.Período,
            m.[Débito],
            m.[Crédito],
            m.[Débito Acumulado],
            m.[Crédito Acumulado]
        FROM [Mayor] m
        JOIN [Clasificador de Cuentas_1] cc
            ON cc.Cuenta = m.Cuenta AND cc.SubCuenta = m.SubCuenta
        WHERE m.Cuenta = @cuenta
        ORDER BY m.SubCuenta, m.Período
      `);

    return JSON.stringify({
      base_datos,
      cuenta,
      total_registros: result.recordset.length,
      detalle: result.recordset,
    }, null, 2);
  }

  // ── estado_situacion ────────────────────────────────────────────
  if (name === 'estado_situacion') {
    const { base_datos } = args;
    const pool = await getPool(base_datos);

    const result = await pool.request().query(`
      SELECT
          LEFT(m.Cuenta, 1)                  AS Grupo,
          m.Cuenta,
          MIN(cc.[Descripción])              AS Nombre,
          MIN(cc.Naturaleza)                 AS Naturaleza,
          SUM(m.[Débito])                    AS TotalDebito,
          SUM(m.[Crédito])                   AS TotalCredito,
          SUM(m.[Débito]) - SUM(m.[Crédito]) AS Saldo
      FROM [Mayor] m
      JOIN [Clasificador de Cuentas_1] cc
          ON cc.Cuenta = m.Cuenta AND cc.SubCuenta = m.SubCuenta
      GROUP BY LEFT(m.Cuenta, 1), m.Cuenta
      ORDER BY m.Cuenta
    `);

    // Organizar por sección del balance
    const grupos: Record<string, {
      grupo: string;
      nombre: string;
      cuentas: any[];
      total_saldo: number;
    }> = {};

    for (const row of result.recordset) {
      const g      = (row.Grupo ?? '?') as string;
      const nombre = GRUPO_NOMBRE[g] ?? `Grupo ${g}`;
      if (!grupos[g]) grupos[g] = { grupo: g, nombre, cuentas: [], total_saldo: 0 };
      grupos[g].cuentas.push(row);
      grupos[g].total_saldo += row.Saldo ?? 0;
    }

    const secciones = Object.values(grupos)
      .sort((a, b) => a.grupo.localeCompare(b.grupo));

    const totalActivos =
      secciones.filter(s => ['1', '2', '3'].includes(s.grupo))
               .reduce((s, g) => s + g.total_saldo, 0);
    const totalPasivosPatr =
      secciones.filter(s => ['4', '5'].includes(s.grupo))
               .reduce((s, g) => s + g.total_saldo, 0);
    const totalResultados =
      secciones.filter(s => s.grupo === '6').reduce((s, g) => s + g.total_saldo, 0);
    const totalIngresos =
      secciones.filter(s => s.grupo === '7').reduce((s, g) => s + g.total_saldo, 0);

    return JSON.stringify({
      base_datos,
      secciones,
      resumen: {
        total_activos_inventarios: totalActivos,
        total_pasivos_patrimonio:  totalPasivosPatr,
        total_resultados:          totalResultados,
        total_ingresos:            totalIngresos,
      },
    }, null, 2);
  }

  // ── comparar_periodos ───────────────────────────────────────────
  // Usa [Débito Acumulado] / [Crédito Acumulado] para saldos a la fecha.
  // FULL OUTER JOIN entre vistas derivadas: soportado en SQL Server 2000.
  if (name === 'comparar_periodos') {
    const { base_datos, periodo_a, periodo_b } = args;
    const pool = await getPool(base_datos);

    const result = await pool.request()
      .input('periodo_a', periodo_a)
      .input('periodo_b', periodo_b)
      .query(`
        SELECT
            ISNULL(pa.Cuenta, pb.Cuenta)             AS Cuenta,
            cn.Nombre,
            ISNULL(pa.DebA, 0)                       AS DebAcumA,
            ISNULL(pa.CreA, 0)                       AS CreAcumA,
            ISNULL(pa.DebA, 0) - ISNULL(pa.CreA, 0) AS SaldoA,
            ISNULL(pb.DebB, 0)                       AS DebAcumB,
            ISNULL(pb.CreB, 0)                       AS CreAcumB,
            ISNULL(pb.DebB, 0) - ISNULL(pb.CreB, 0) AS SaldoB,
            (ISNULL(pb.DebB, 0) - ISNULL(pb.CreB, 0)) -
            (ISNULL(pa.DebA, 0) - ISNULL(pa.CreA, 0)) AS Variacion
        FROM (
            SELECT Cuenta,
                   SUM([Débito Acumulado])  AS DebA,
                   SUM([Crédito Acumulado]) AS CreA
            FROM [Mayor]
            WHERE Período = @periodo_a
            GROUP BY Cuenta
        ) pa
        FULL OUTER JOIN (
            SELECT Cuenta,
                   SUM([Débito Acumulado])  AS DebB,
                   SUM([Crédito Acumulado]) AS CreB
            FROM [Mayor]
            WHERE Período = @periodo_b
            GROUP BY Cuenta
        ) pb ON pa.Cuenta = pb.Cuenta
        LEFT JOIN (
            SELECT Cuenta, MIN([Descripción]) AS Nombre
            FROM [Clasificador de Cuentas_1]
            GROUP BY Cuenta
        ) cn ON cn.Cuenta = ISNULL(pa.Cuenta, pb.Cuenta)
        ORDER BY Cuenta
      `);

    return JSON.stringify({
      base_datos,
      periodo_a,
      periodo_b,
      total_cuentas: result.recordset.length,
      comparativa:   result.recordset,
    }, null, 2);
  }

  // ── ventas_periodo ──────────────────────────────────────────────
  // SUM(Crédito) de 901/903 = ventas devengadas del período.
  // Saldo neto (Crédito-Débito) incluye el asiento de cierre contra 999;
  // si el ejercicio cerró, saldo final = 0 — eso es CORRECTO.
  if (name === 'ventas_periodo') {
    const { base_datos, periodo } = args;
    const pool = await getPool(base_datos);
    const req  = pool.request();
    const filtroPer = periodo != null ? `AND m.Período = @periodo` : '';
    if (periodo != null) req.input('periodo', periodo);

    const result = await req.query(`
      SELECT
          m.Cuenta,
          m.SubCuenta,
          MIN(cc.[Descripción]) AS Nombre,
          m.Período,
          SUM(m.[Débito])       AS TotalDebito,
          SUM(m.[Crédito])      AS TotalCredito
      FROM [Mayor] m
      JOIN [Clasificador de Cuentas_1] cc
          ON cc.Cuenta = m.Cuenta AND cc.SubCuenta = m.SubCuenta
      WHERE m.Cuenta IN ('901', '903')
        ${filtroPer}
      GROUP BY m.Cuenta, m.SubCuenta, m.Período
      ORDER BY m.Cuenta, m.SubCuenta, m.Período
    `);

    const totCredito = result.recordset.reduce((s: number, r: any) => s + (r.TotalCredito ?? 0), 0);
    const totDebito  = result.recordset.reduce((s: number, r: any) => s + (r.TotalDebito  ?? 0), 0);

    return JSON.stringify({
      base_datos,
      periodo_filtro: periodo ?? 'todos',
      nota: [
        'SUM(Crédito) de 901/903 = ventas devengadas (antes del cierre)',
        'Saldo neto = Crédito - Débito; incluye asiento de cierre contra 999',
        'Saldo neto = 0 tras cierre del ejercicio — es correcto, no es un error',
        'Para conciliar con Fact: usar conciliacion_fact_conta',
      ],
      total_credito_ventas: totCredito,
      total_debito_ajustes: totDebito,
      saldo_neto:           totCredito - totDebito,
      detalle: result.recordset,
    }, null, 2);
  }

  throw new Error(`Tool desconocida: ${name}`);
}
