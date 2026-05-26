import { getPool } from '../db.js';

// ── REGLA CRÍTICA ─────────────────────────────────────────────────
// FACTURA_ENC mezcla facturas reales (FC) y prefacturas (PF).
// Filtrar SIEMPRE con FILTRO_REAL para evitar doble conteo.
// Cancelada = 1 también excluye facturas anuladas.
const FILTRO_REAL = `CODIGO_TIPOFACTURA = 'FC' AND ISNULL(Cancelada, 0) = 0`;

export const facturacionTools = [
  {
    name: 'resumen_facturacion',
    description: `Facturación real de FACTURA_ENC agrupada por período.
SOLO incluye CODIGO_TIPOFACTURA='FC' (facturas reales).
EXCLUYE prefacturas PF y canceladas — incluirlas genera doble conteo.
Importe en TOTAL_MN (CUP). Período en columna PER ('01'=enero...'12'=dic).
Requiere BD Fact: FactCAMA2025, FactANAV2025, etc.`,
    inputSchema: {
      type: 'object',
      properties: {
        base_datos: {
          type: 'string',
          description: 'BD del módulo Fact. Ej: FactCAMA2025',
        },
        periodo: {
          type: 'string',
          description: "Período opcional '01'..'12'. Si se omite, devuelve todos.",
        },
      },
      required: ['base_datos'],
    },
  },
  {
    name: 'conciliacion_fact_conta',
    description: `Conciliación entre facturación real y contabilización.
Compara el total FC no cancelado (FACTURA_ENC) con el total marcado
como Contabilizada=1. La brecha son facturas reales aún no contabilizadas.
Con base_datos_conta cruza además contra los créditos de cuentas 7xx
del Mayor para detectar asientos sin respaldo en facturación.
Solo procesa CODIGO_TIPOFACTURA='FC' y excluye canceladas.`,
    inputSchema: {
      type: 'object',
      properties: {
        base_datos_fact: {
          type: 'string',
          description: 'BD de Facturación. Ej: FactCAMA2025',
        },
        base_datos_conta: {
          type: 'string',
          description: 'BD de Contabilidad (opcional). Ej: ContaCAMA2025',
        },
        periodo: {
          type: 'string',
          description: "Filtrar por período '01'..'12'. Si se omite, todos.",
        },
      },
      required: ['base_datos_fact'],
    },
  },
];

export async function ejecutarFacturacion(name: string, args: any): Promise<string> {

  // ── resumen_facturacion ─────────────────────────────────────────
  if (name === 'resumen_facturacion') {
    const { base_datos, periodo } = args;
    const pool = await getPool(base_datos);

    const req = pool.request();
    const filtroPer = periodo ? `AND PER = @periodo` : '';
    if (periodo) req.input('periodo', periodo);

    const result = await req.query(`
      SELECT
          PER                                                                  AS Periodo,
          COUNT(*)                                                             AS NumFacturas,
          SUM(TOTAL_MN)                                                        AS TotalFacturado,
          MIN(FECHA_DOC)                                                       AS PrimeraFecha,
          MAX(FECHA_DOC)                                                       AS UltimaFecha,
          SUM(CASE WHEN Contabilizada = 1           THEN 1       ELSE 0 END)  AS NumContabilizadas,
          SUM(CASE WHEN Contabilizada = 1           THEN TOTAL_MN ELSE 0 END) AS TotalContabilizado,
          SUM(CASE WHEN ISNULL(Contabilizada,0) = 0 THEN 1       ELSE 0 END)  AS NumPendientes,
          SUM(CASE WHEN ISNULL(Contabilizada,0) = 0 THEN TOTAL_MN ELSE 0 END) AS TotalPendiente
      FROM FACTURA_ENC
      WHERE ${FILTRO_REAL} ${filtroPer}
      GROUP BY PER
      ORDER BY PER
    `);

    const rows = result.recordset;
    const totFact  = rows.reduce((s: number, r: any) => s + (r.TotalFacturado    ?? 0), 0);
    const totConta = rows.reduce((s: number, r: any) => s + (r.TotalContabilizado ?? 0), 0);
    const totPend  = rows.reduce((s: number, r: any) => s + (r.TotalPendiente    ?? 0), 0);

    return JSON.stringify({
      base_datos,
      nota:           'Solo facturas FC no canceladas — prefacturas PF excluidas',
      periodo_filtro: periodo ?? 'todos',
      total_general: {
        total_facturado:     totFact,
        total_contabilizado: totConta,
        total_pendiente:     totPend,
        pct_contabilizado:   totFact > 0
          ? Math.round(totConta / totFact * 10000) / 100
          : null,
      },
      por_periodo: rows,
    }, null, 2);
  }

  // ── conciliacion_fact_conta ─────────────────────────────────────
  if (name === 'conciliacion_fact_conta') {
    const { base_datos_fact, base_datos_conta, periodo } = args;
    const factPool = await getPool(base_datos_fact);

    // PER en Fact es string '01'..'12'; Período en Mayor es int 1..12
    const periodoInt: number | null = periodo ? parseInt(periodo, 10) : null;
    const filtroPer = periodo ? `AND PER = @periodo` : '';

    // ── Resumen por período ───────────────────────────────────────
    const reqRes = factPool.request();
    if (periodo) reqRes.input('periodo', periodo);

    const resumen = await reqRes.query(`
      SELECT
          PER                                                                  AS Periodo,
          COUNT(*)                                                             AS TotalFC,
          SUM(TOTAL_MN)                                                        AS TotalFacturado,
          SUM(CASE WHEN Contabilizada = 1           THEN 1       ELSE 0 END)  AS ContabilizadasN,
          SUM(CASE WHEN Contabilizada = 1           THEN TOTAL_MN ELSE 0 END) AS TotalContabilizado,
          SUM(CASE WHEN ISNULL(Contabilizada,0) = 0 THEN 1       ELSE 0 END)  AS PendientesN,
          SUM(CASE WHEN ISNULL(Contabilizada,0) = 0 THEN TOTAL_MN ELSE 0 END) AS TotalPendiente
      FROM FACTURA_ENC
      WHERE ${FILTRO_REAL} ${filtroPer}
      GROUP BY PER
      ORDER BY PER
    `);

    // ── Detalle de pendientes (FC no canceladas, no contabilizadas) ──
    const reqPend = factPool.request();
    if (periodo) reqPend.input('periodo', periodo);

    const pendientes = await reqPend.query(`
      SELECT TOP 200 *
      FROM FACTURA_ENC
      WHERE ${FILTRO_REAL}
        AND ISNULL(Contabilizada, 0) = 0
        ${filtroPer}
      ORDER BY PER, FECHA_DOC
    `);

    const rows   = resumen.recordset;
    const totFact  = rows.reduce((s: number, r: any) => s + (r.TotalFacturado    ?? 0), 0);
    const totConta = rows.reduce((s: number, r: any) => s + (r.TotalContabilizado ?? 0), 0);
    const totPend  = rows.reduce((s: number, r: any) => s + (r.TotalPendiente    ?? 0), 0);

    const resultado: any = {
      base_datos_fact,
      periodo_filtro: periodo ?? 'todos',
      nota: 'Solo facturas FC no canceladas — prefacturas PF excluidas',
      total_general: {
        total_facturado:     totFact,
        total_contabilizado: totConta,
        brecha_pendiente:    totPend,
        pct_contabilizado:   totFact > 0
          ? Math.round(totConta / totFact * 10000) / 100
          : null,
      },
      por_periodo: rows,
      pendientes_de_contabilizar: {
        total:   pendientes.recordset.length,
        nota_limite: pendientes.recordset.length === 200
          ? 'Resultado limitado a 200 filas — usar periodo para acotar'
          : null,
        detalle: pendientes.recordset,
      },
    };

    // ── Cruce con Mayor (cuentas 7xx) si se provee base_datos_conta ──
    if (base_datos_conta) {
      const contaPool = await getPool(base_datos_conta);
      const reqConta  = contaPool.request();
      const filtroConta = periodoInt !== null
        ? `AND m.Período = @periodo_int`
        : '';
      if (periodoInt !== null) reqConta.input('periodo_int', periodoInt);

      const saldo7xx = await reqConta.query(`
        SELECT
            m.Cuenta,
            MIN(cc.[Descripción]) AS Nombre,
            SUM(m.[Débito])       AS TotalDebito,
            SUM(m.[Crédito])      AS TotalCredito
        FROM [Mayor] m
        JOIN [Clasificador de Cuentas_1] cc
            ON cc.Cuenta = m.Cuenta AND cc.SubCuenta = m.SubCuenta
        WHERE LEFT(m.Cuenta, 1) = '7'
          ${filtroConta}
        GROUP BY m.Cuenta
        ORDER BY m.Cuenta
      `);

      const totalCredito7xx = saldo7xx.recordset.reduce(
        (s: number, r: any) => s + (r.TotalCredito ?? 0), 0
      );

      resultado.cruce_conta = {
        base_datos_conta,
        periodo_conta: periodoInt !== null ? periodoInt : 'todos',
        cuentas_7xx:          saldo7xx.recordset,
        total_credito_7xx:    totalCredito7xx,
        // diferencia positiva: Mayor contiene más ingresos que lo facturado+contabilizado
        diferencia_mayor_vs_fc_contabilizado: totalCredito7xx - totConta,
        nota: 'Diferencia ≈ 0 indica conciliación perfecta. '
            + 'Diferencia positiva = asientos en Mayor sin factura FC. '
            + 'Diferencia negativa = facturas FC contabilizadas que no llegaron al Mayor.',
      };
    }

    return JSON.stringify(resultado, null, 2);
  }

  throw new Error(`Tool desconocida: ${name}`);
}
