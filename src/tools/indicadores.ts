// src/tools/indicadores.ts
import {
  calcularLiquidez,
  calcularRentabilidad,
  calcularEndeudamiento,
  calcularOperacional,
  calcularTodos,
  calcularTendencia,
  resumenSemaforos,
  type DatosLiquidez,
  type DatosRentabilidad,
  type DatosEndeudamiento,
  type DatosOperacional,
} from '../engine/calculadora.js';

// ── Definiciones de tools ──────────────────────────────────────────

export const indicadoresTools = [
  {
    name: 'kpi_liquidez',
    description: `Calcula los ratios de liquidez: razón corriente, prueba ácida y liquidez inmediata.
Extraer previamente de la BD de Tesorería/Contabilidad: activo corriente, pasivo corriente,
inventario y efectivo para el período de análisis.
Devuelve cada KPI con su valor, semáforo (verde/amarillo/rojo) e interpretación.`,
    inputSchema: {
      type: 'object',
      properties: {
        activo_corriente: { type: 'number', description: 'Total activo corriente' },
        pasivo_corriente: { type: 'number', description: 'Total pasivo corriente' },
        inventario:       { type: 'number', description: 'Valor de inventarios (para prueba ácida)' },
        efectivo:         { type: 'number', description: 'Efectivo y equivalentes (para liquidez inmediata)' },
        periodo:          { type: 'string', description: 'Ej: "2025-Q1", "2024", "Ene-2025"' },
        agencia:          { type: 'string', description: 'Código de agencia analizada, ej: CAMA' },
      },
      required: ['activo_corriente', 'pasivo_corriente'],
    },
  },

  {
    name: 'kpi_rentabilidad',
    description: `Calcula los indicadores de rentabilidad: márgenes bruto, operacional y neto,
ROA, ROE, EBITDA y margen EBITDA.
Extraer de la BD de Facturación y Contabilidad: ventas, costo de ventas, utilidades,
activo total y patrimonio del período.`,
    inputSchema: {
      type: 'object',
      properties: {
        ventas_netas:               { type: 'number', description: 'Ingresos netos por ventas' },
        costo_ventas:               { type: 'number', description: 'Costo directo de ventas' },
        utilidad_operacional:       { type: 'number', description: 'EBIT — utilidad antes de intereses e impuestos' },
        utilidad_neta:              { type: 'number', description: 'Utilidad después de impuestos' },
        activo_total:               { type: 'number', description: 'Total activos (para ROA)' },
        patrimonio:                 { type: 'number', description: 'Patrimonio neto (para ROE)' },
        depreciacion_amortizacion:  { type: 'number', description: 'D&A del período (para EBITDA)' },
        gastos_financieros:         { type: 'number', description: 'Intereses y cargos financieros' },
        periodo:                    { type: 'string', description: 'Ej: "2025", "2024-S1"' },
        agencia:                    { type: 'string', description: 'Código de agencia' },
      },
      required: ['ventas_netas', 'costo_ventas'],
    },
  },

  {
    name: 'kpi_endeudamiento',
    description: `Calcula los ratios de endeudamiento: razón de endeudamiento, apalancamiento financiero
y cobertura de intereses.
Extraer del balance general: pasivo total, activo total, patrimonio,
utilidad operacional y gastos financieros.`,
    inputSchema: {
      type: 'object',
      properties: {
        pasivo_total:          { type: 'number', description: 'Total pasivos' },
        activo_total:          { type: 'number', description: 'Total activos' },
        patrimonio:            { type: 'number', description: 'Patrimonio neto' },
        utilidad_operacional:  { type: 'number', description: 'EBIT (para cobertura de intereses)' },
        gastos_financieros:    { type: 'number', description: 'Intereses pagados (para cobertura)' },
        periodo:               { type: 'string', description: 'Ej: "2025", "Dic-2024"' },
        agencia:               { type: 'string', description: 'Código de agencia' },
      },
      required: ['pasivo_total', 'activo_total', 'patrimonio'],
    },
  },

  {
    name: 'kpi_operacional',
    description: `Calcula los indicadores operacionales: rotación y días de inventario, cobro y pago,
y el ciclo de conversión de efectivo (CCE).
Extraer de las BDs de Inventario, Facturación, CxC y CxP. Usar promedios del período
((saldo_inicial + saldo_final) / 2) para inventario, CxC y CxP.`,
    inputSchema: {
      type: 'object',
      properties: {
        ventas_netas:         { type: 'number', description: 'Ingresos netos por ventas' },
        costo_ventas:         { type: 'number', description: 'Costo de ventas del período' },
        inventario_promedio:  { type: 'number', description: '(Inv_inicio + Inv_fin) / 2' },
        cxc_promedio:         { type: 'number', description: '(CxC_inicio + CxC_fin) / 2' },
        compras:              { type: 'number', description: 'Total compras del período (para días de pago)' },
        cxp_promedio:         { type: 'number', description: '(CxP_inicio + CxP_fin) / 2' },
        periodo:              { type: 'string', description: 'Ej: "2025", "2024-Q3"' },
        agencia:              { type: 'string', description: 'Código de agencia' },
      },
      required: ['ventas_netas', 'costo_ventas'],
    },
  },

  {
    name: 'kpi_completo',
    description: `Calcula los cuatro grupos de KPIs financieros en un solo llamado: liquidez,
rentabilidad, endeudamiento y operacional. Devuelve además un resumen de semáforos.
Pasar solo los campos disponibles; los KPIs que requieran datos faltantes mostrarán "n/a".`,
    inputSchema: {
      type: 'object',
      properties: {
        // Liquidez
        activo_corriente:           { type: 'number' },
        pasivo_corriente:           { type: 'number' },
        inventario:                 { type: 'number' },
        efectivo:                   { type: 'number' },
        // Rentabilidad
        ventas_netas:               { type: 'number' },
        costo_ventas:               { type: 'number' },
        utilidad_operacional:       { type: 'number' },
        utilidad_neta:              { type: 'number' },
        activo_total:               { type: 'number' },
        patrimonio:                 { type: 'number' },
        depreciacion_amortizacion:  { type: 'number' },
        gastos_financieros:         { type: 'number' },
        // Endeudamiento
        pasivo_total:               { type: 'number' },
        // Operacional
        inventario_promedio:        { type: 'number' },
        cxc_promedio:               { type: 'number' },
        compras:                    { type: 'number' },
        cxp_promedio:               { type: 'number' },
        // Metadata
        periodo:                    { type: 'string', description: 'Ej: "2025", "Ene-Jun 2024"' },
        agencia:                    { type: 'string', description: 'Código de agencia' },
      },
    },
  },

  {
    name: 'kpi_tendencia',
    description: `Calcula un grupo de KPIs para múltiples períodos y muestra la variación entre ellos.
Ideal para análisis de tendencias anuales o trimestrales.
El parámetro datos_json debe ser un array JSON de objetos, cada uno con un campo "periodo"
(string) más los campos financieros del grupo seleccionado.
Ejemplo datos_json para liquidez: [{"periodo":"2023","activo_corriente":100000,"pasivo_corriente":50000},...]`,
    inputSchema: {
      type: 'object',
      properties: {
        categoria: {
          type: 'string',
          enum: ['liquidez', 'rentabilidad', 'endeudamiento', 'operacional'],
          description: 'Grupo de KPIs a calcular para cada período',
        },
        datos_json: {
          type: 'string',
          description: 'JSON array de objetos {periodo: string, ...campos_financieros}',
        },
      },
      required: ['categoria', 'datos_json'],
    },
  },
];

// ── Handler ────────────────────────────────────────────────────────

export async function ejecutarIndicadores(name: string, args: any): Promise<string> {

  // ── kpi_liquidez ────────────────────────────────────────────────
  if (name === 'kpi_liquidez') {
    const datos: DatosLiquidez = {
      activo_corriente: args.activo_corriente,
      pasivo_corriente: args.pasivo_corriente,
      ...(args.inventario !== undefined && { inventario: args.inventario }),
      ...(args.efectivo   !== undefined && { efectivo:   args.efectivo   }),
    };
    const kpis = calcularLiquidez(datos);
    return JSON.stringify({
      categoria:  'Liquidez',
      periodo:    args.periodo  ?? null,
      agencia:    args.agencia  ?? null,
      kpis,
    }, null, 2);
  }

  // ── kpi_rentabilidad ────────────────────────────────────────────
  if (name === 'kpi_rentabilidad') {
    const datos: DatosRentabilidad = {
      ventas_netas: args.ventas_netas,
      costo_ventas: args.costo_ventas,
      ...(args.utilidad_operacional      !== undefined && { utilidad_operacional:      args.utilidad_operacional      }),
      ...(args.utilidad_neta             !== undefined && { utilidad_neta:             args.utilidad_neta             }),
      ...(args.activo_total              !== undefined && { activo_total:              args.activo_total              }),
      ...(args.patrimonio                !== undefined && { patrimonio:                args.patrimonio                }),
      ...(args.depreciacion_amortizacion !== undefined && { depreciacion_amortizacion: args.depreciacion_amortizacion }),
      ...(args.gastos_financieros        !== undefined && { gastos_financieros:        args.gastos_financieros        }),
    };
    const kpis = calcularRentabilidad(datos);
    return JSON.stringify({
      categoria: 'Rentabilidad',
      periodo:   args.periodo ?? null,
      agencia:   args.agencia ?? null,
      kpis,
    }, null, 2);
  }

  // ── kpi_endeudamiento ───────────────────────────────────────────
  if (name === 'kpi_endeudamiento') {
    const datos: DatosEndeudamiento = {
      pasivo_total: args.pasivo_total,
      activo_total: args.activo_total,
      patrimonio:   args.patrimonio,
      ...(args.utilidad_operacional !== undefined && { utilidad_operacional: args.utilidad_operacional }),
      ...(args.gastos_financieros   !== undefined && { gastos_financieros:   args.gastos_financieros   }),
    };
    const kpis = calcularEndeudamiento(datos);
    return JSON.stringify({
      categoria: 'Endeudamiento',
      periodo:   args.periodo ?? null,
      agencia:   args.agencia ?? null,
      kpis,
    }, null, 2);
  }

  // ── kpi_operacional ─────────────────────────────────────────────
  if (name === 'kpi_operacional') {
    const datos: DatosOperacional = {
      ventas_netas: args.ventas_netas,
      costo_ventas: args.costo_ventas,
      ...(args.inventario_promedio !== undefined && { inventario_promedio: args.inventario_promedio }),
      ...(args.cxc_promedio        !== undefined && { cxc_promedio:        args.cxc_promedio        }),
      ...(args.compras             !== undefined && { compras:             args.compras             }),
      ...(args.cxp_promedio        !== undefined && { cxp_promedio:        args.cxp_promedio        }),
    };
    const kpis = calcularOperacional(datos);
    return JSON.stringify({
      categoria: 'Operacional',
      periodo:   args.periodo ?? null,
      agencia:   args.agencia ?? null,
      kpis,
    }, null, 2);
  }

  // ── kpi_completo ────────────────────────────────────────────────
  if (name === 'kpi_completo') {
    const {
      activo_corriente, pasivo_corriente, inventario, efectivo,
      ventas_netas, costo_ventas, utilidad_operacional, utilidad_neta,
      activo_total, patrimonio, depreciacion_amortizacion, gastos_financieros,
      pasivo_total,
      inventario_promedio, cxc_promedio, compras, cxp_promedio,
      periodo, agencia,
    } = args;

    const liquidezOk  = activo_corriente !== undefined && pasivo_corriente !== undefined;
    const rentOk      = ventas_netas !== undefined && costo_ventas !== undefined;
    const deudaOk     = pasivo_total !== undefined && activo_total !== undefined && patrimonio !== undefined;
    const operOk      = ventas_netas !== undefined && costo_ventas !== undefined;

    const kpis = calcularTodos({
      liquidez: liquidezOk ? {
        activo_corriente, pasivo_corriente,
        ...(inventario !== undefined && { inventario }),
        ...(efectivo   !== undefined && { efectivo   }),
      } : undefined,
      rentabilidad: rentOk ? {
        ventas_netas, costo_ventas,
        ...(utilidad_operacional      !== undefined && { utilidad_operacional      }),
        ...(utilidad_neta             !== undefined && { utilidad_neta             }),
        ...(activo_total              !== undefined && { activo_total              }),
        ...(patrimonio                !== undefined && { patrimonio                }),
        ...(depreciacion_amortizacion !== undefined && { depreciacion_amortizacion }),
        ...(gastos_financieros        !== undefined && { gastos_financieros        }),
      } : undefined,
      endeudamiento: deudaOk ? {
        pasivo_total, activo_total, patrimonio,
        ...(utilidad_operacional !== undefined && { utilidad_operacional }),
        ...(gastos_financieros   !== undefined && { gastos_financieros   }),
      } : undefined,
      operacional: operOk ? {
        ventas_netas, costo_ventas,
        ...(inventario_promedio !== undefined && { inventario_promedio }),
        ...(cxc_promedio        !== undefined && { cxc_promedio        }),
        ...(compras             !== undefined && { compras             }),
        ...(cxp_promedio        !== undefined && { cxp_promedio        }),
      } : undefined,
    });

    const semaforos = resumenSemaforos(kpis);
    const conteo = { verde: 0, amarillo: 0, rojo: 0, 'n/a': 0 };
    for (const s of Object.values(semaforos)) conteo[s]++;

    return JSON.stringify({
      categoria:  'KPI Completo',
      periodo:    periodo  ?? null,
      agencia:    agencia  ?? null,
      resumen_semaforos: semaforos,
      conteo_semaforos:  conteo,
      kpis,
    }, null, 2);
  }

  // ── kpi_tendencia ───────────────────────────────────────────────
  if (name === 'kpi_tendencia') {
    const { categoria, datos_json } = args;

    let periodos: Array<{ periodo: string } & Record<string, number>>;
    try {
      periodos = JSON.parse(datos_json);
    } catch {
      throw new Error('datos_json no es JSON válido. Debe ser un array de objetos con campo "periodo".');
    }

    if (!Array.isArray(periodos) || periodos.length === 0) {
      throw new Error('datos_json debe ser un array no vacío.');
    }
    if (!periodos.every(p => typeof p.periodo === 'string')) {
      throw new Error('Cada elemento debe tener un campo "periodo" (string).');
    }

    const calcFnMap: Record<string, (d: any) => any> = {
      liquidez:      calcularLiquidez,
      rentabilidad:  calcularRentabilidad,
      endeudamiento: calcularEndeudamiento,
      operacional:   calcularOperacional,
    };

    const calcFn = calcFnMap[categoria];
    if (!calcFn) throw new Error(`Categoría desconocida: ${categoria}`);

    const tendencia = calcularTendencia(periodos, calcFn);

    return JSON.stringify({
      categoria,
      periodos_analizados: periodos.length,
      tendencia,
    }, null, 2);
  }

  throw new Error(`Tool de indicadores desconocida: ${name}`);
}
