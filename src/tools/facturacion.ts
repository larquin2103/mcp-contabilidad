import { getPool } from '../db.js';

// ── FILTRO DE ORO — validado contra datos reales (FactCAMA) ──────
// Con solo FC + Cancelada=0 el total pasa de 3.09M (inflado) a 1.20M real.
// Las PF (prefacturas) representan ~57% del importe total: NUNCA sumarlas.
// Cancelada = 0 es comparación exacta — la columna no tiene NULLs en producción.
// La columna Contabilizada NO es fiable: el sistema contabiliza por asiento
// resumen mensual, no por factura. Para conciliar, usar cuentas 901/903 del Mayor.
const FILTRO_REAL = `CODIGO_TIPOFACTURA = 'FC' AND Cancelada = 0`;

export const facturacionTools = [
  {
    name: 'facturacion_real',
    description: `Facturación real de FACTURA_ENC, período a período.
SOLO CODIGO_TIPOFACTURA='FC' con Cancelada=0 (facturas reales vigentes).
Las PF (prefacturas) inflan el resultado ~57% — están excluidas siempre.
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
    name: 'desglose_facturacion',
    description: `Desglose de FACTURA_ENC por tipo (FC/PF) y estado de cancelación.
Muestra exactamente cuánto se incluye vs excluye en el filtro FC+no cancelada.
Usar antes de analizar para confirmar la magnitud del doble conteo por PF.`,
    inputSchema: {
      type: 'object',
      properties: {
        base_datos: {
          type: 'string',
          description: 'BD del módulo Fact. Ej: FactCAMA2025',
        },
        periodo: {
          type: 'string',
          description: "Período opcional '01'..'12'.",
        },
      },
      required: ['base_datos'],
    },
  },
  {
    name: 'conciliacion_fact_conta',
    description: `Conciliación entre facturación real (FC) y ventas contabilizadas.
Compara SUM(TOTAL_MN) de FC+Cancelada=0 en FACTURA_ENC contra
SUM(Crédito) de cuentas 901/903 del Mayor. Desfase <15% es NORMAL
(timing: las facturas se emiten antes del cierre contable).
No usa la columna Contabilizada — no es fiable (contabilización por asiento mensual).`,
    inputSchema: {
      type: 'object',
      properties: {
        base_datos_fact: {
          type: 'string',
          description: 'BD de Facturación. Ej: FactCAMA2025',
        },
        base_datos_conta: {
          type: 'string',
          description: 'BD de Contabilidad. Ej: ContaCAMA2025',
        },
        periodo: {
          type: 'string',
          description: "Filtrar por período '01'..'12'. Si se omite, todos.",
        },
      },
      required: ['base_datos_fact', 'base_datos_conta'],
    },
  },
];

export async function ejecutarFacturacion(name: string, args: any): Promise<string> {

  // ── facturacion_real ────────────────────────────────────────────
  if (name === 'facturacion_real') {
    const { base_datos, periodo } = args;
    const pool = await getPool(base_datos);
    const req  = pool.request();
    const filtroPer = periodo ? `AND PER = @periodo` : '';
    if (periodo) req.input('periodo', periodo);

    const result = await req.query(`
      SELECT
          PER            AS Periodo,
          COUNT(*)       AS NumFacturas,
          SUM(TOTAL_MN)  AS TotalFacturado,
          MIN(FECHA_DOC) AS PrimeraFecha,
          MAX(FECHA_DOC) AS UltimaFecha
      FROM FACTURA_ENC
      WHERE ${FILTRO_REAL} ${filtroPer}
      GROUP BY PER
      ORDER BY PER
    `);

    const rows    = result.recordset;
    const total   = rows.reduce((s: number, r: any) => s + (r.TotalFacturado ?? 0), 0);
    const nFact   = rows.reduce((s: number, r: any) => s + (r.NumFacturas    ?? 0), 0);

    return JSON.stringify({
      base_datos,
      filtro:         "CODIGO_TIPOFACTURA='FC' AND Cancelada=0 — prefacturas PF excluidas",
      periodo_filtro: periodo ?? 'todos',
      total_general: {
        num_facturas:    nFact,
        total_facturado: total,
      },
      por_periodo: rows,
    }, null, 2);
  }

  // ── desglose_facturacion ────────────────────────────────────────
  if (name === 'desglose_facturacion') {
    const { base_datos, periodo } = args;
    const pool = await getPool(base_datos);
    const req  = pool.request();
    const filtroPer = periodo ? `AND PER = @periodo` : '';
    if (periodo) req.input('periodo', periodo);

    const result = await req.query(`
      SELECT
          CODIGO_TIPOFACTURA AS TipoFactura,
          Cancelada,
          COUNT(*)           AS NumDocumentos,
          SUM(TOTAL_MN)      AS TotalMN
      FROM FACTURA_ENC
      WHERE 1=1 ${filtroPer}
      GROUP BY CODIGO_TIPOFACTURA, Cancelada
      ORDER BY CODIGO_TIPOFACTURA, Cancelada
    `);

    let totalReal = 0, totalPF = 0, totalCanceladas = 0, totalTodo = 0;
    for (const r of result.recordset) {
      const imp = r.TotalMN ?? 0;
      totalTodo += imp;
      if (r.TipoFactura === 'FC' && r.Cancelada === 0) totalReal       += imp;
      else if (r.TipoFactura === 'PF')                  totalPF         += imp;
      else                                              totalCanceladas += imp;
    }

    return JSON.stringify({
      base_datos,
      periodo_filtro: periodo ?? 'todos',
      resumen: {
        total_todos_documentos:    totalTodo,
        total_real_FC_vigentes:    totalReal,
        excluido_prefacturas_PF:   totalPF,
        excluido_canceladas:       totalCanceladas,
        pct_inflacion_si_incluye_PF: totalReal > 0
          ? Math.round(totalPF / totalReal * 10000) / 100
          : null,
        nota: "Solo 'FC' + Cancelada=0 es la cifra financiera correcta",
      },
      detalle_por_tipo: result.recordset,
    }, null, 2);
  }

  // ── conciliacion_fact_conta ─────────────────────────────────────
  if (name === 'conciliacion_fact_conta') {
    const { base_datos_fact, base_datos_conta, periodo } = args;
    const factPool  = await getPool(base_datos_fact);
    const contaPool = await getPool(base_datos_conta);

    // PER en Fact = string '01'..'12'; Período en Mayor = int 1..12
    const periodoInt: number | null = periodo ? parseInt(periodo, 10) : null;
    const filtroPer   = periodo        ? `AND PER = @periodo`            : '';
    const filtroConta = periodoInt !== null ? `AND m.Período = @periodo_int` : '';

    // Facturación real (Fact)
    const reqFact = factPool.request();
    if (periodo) reqFact.input('periodo', periodo);
    const rFact = await reqFact.query(`
      SELECT
          PER           AS Periodo,
          COUNT(*)      AS NumFC,
          SUM(TOTAL_MN) AS TotalFacturado
      FROM FACTURA_ENC
      WHERE ${FILTRO_REAL} ${filtroPer}
      GROUP BY PER
      ORDER BY PER
    `);

    // Ventas contabilizadas — crédito de 901/903 en Mayor (Conta)
    const reqConta = contaPool.request();
    if (periodoInt !== null) reqConta.input('periodo_int', periodoInt);
    const rConta = await reqConta.query(`
      SELECT
          m.Cuenta,
          m.SubCuenta,
          MIN(cc.[Descripción]) AS Nombre,
          m.Período,
          SUM(m.[Crédito])      AS TotalCredito
      FROM [Mayor] m
      JOIN [Clasificador de Cuentas_1] cc
          ON cc.Cuenta = m.Cuenta AND cc.SubCuenta = m.SubCuenta
      WHERE m.Cuenta IN ('901', '903')
        ${filtroConta}
      GROUP BY m.Cuenta, m.SubCuenta, m.Período
      ORDER BY m.Cuenta, m.SubCuenta, m.Período
    `);

    const totFacturado     = rFact.recordset.reduce((s: number, r: any) => s + (r.TotalFacturado ?? 0), 0);
    const totContabilizado = rConta.recordset.reduce((s: number, r: any) => s + (r.TotalCredito  ?? 0), 0);
    const diferencia       = totFacturado - totContabilizado;
    const pctDesfase       = totFacturado > 0
      ? Math.round(Math.abs(diferencia) / totFacturado * 10000) / 100
      : null;

    const alertaConciliacion =
      pctDesfase === null ? 'sin datos' :
      pctDesfase <= 15    ? '✅ normal — desfase ≤ 15% es habitual por timing de registro' :
      pctDesfase <= 30    ? '🟡 revisar — desfase entre 15% y 30%, verificar cierres pendientes' :
                            '🔴 investigar — desfase > 30%, puede haber facturas sin contabilizar o asientos incorrectos';

    return JSON.stringify({
      base_datos_fact,
      base_datos_conta,
      periodo_filtro: periodo ?? 'todos',
      nota_metodologia: [
        "Facturado: SUM(TOTAL_MN) de FACTURA_ENC donde FC + Cancelada=0",
        "Contabilizado: SUM(Crédito) de Mayor cuentas 901/903",
        "Contabilizada en FACTURA_ENC NO se usa — no es fiable (asiento mensual)",
        "Desfase <15% es NORMAL por timing — facturas emitidas antes del cierre contable",
      ],
      total_general: {
        total_facturado:              totFacturado,
        total_contabilizado_901_903:  totContabilizado,
        diferencia_fact_minus_conta:  diferencia,
        pct_desfase:                  pctDesfase,
        alerta_conciliacion:          alertaConciliacion,
      },
      facturado_por_periodo:  rFact.recordset,
      contabilizado_901_903:  rConta.recordset,
    }, null, 2);
  }

  throw new Error(`Tool desconocida: ${name}`);
}
