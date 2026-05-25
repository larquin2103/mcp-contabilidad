// src/tools/escenarios.ts
import {
  modelarIncrementoVentas,
  modelarReduccionCostes,
  modelarNuevaDeuda,
  modelarMejoraCobro,
  modelarMejoraPago,
} from '../engine/modelador.js';

// ── Definiciones de tools ──────────────────────────────────────────

export const escenarioTools = [
  {
    name: 'escenario_incremento_ventas',
    description: `Modela el impacto de un incremento porcentual en ventas sobre EBITDA y márgenes.
Simula cuánto del incremento se convierte en utilidad según la estructura de costes fijos/variables.
Devuelve comparativa antes/después de márgenes bruto, operacional, neto, EBITDA y alerta de viabilidad.
Extraer base de Facturación y Contabilidad: ventas_netas, costo_ventas, utilidad_operacional, utilidad_neta.`,
    inputSchema: {
      type: 'object',
      properties: {
        // Base financiera
        ventas_netas:               { type: 'number', description: 'Ventas netas actuales' },
        costo_ventas:               { type: 'number', description: 'Costo de ventas actual' },
        utilidad_operacional:       { type: 'number', description: 'EBIT actual' },
        utilidad_neta:              { type: 'number', description: 'Utilidad neta actual' },
        activo_total:               { type: 'number', description: 'Total activos (para ROA)' },
        patrimonio:                 { type: 'number', description: 'Patrimonio (para ROE)' },
        depreciacion_amortizacion:  { type: 'number', description: 'D&A actual (para EBITDA)' },
        // Parámetros del escenario
        incremento_pct: {
          type: 'number',
          description: 'Porcentaje de incremento en ventas. Ej: 15 para +15%',
        },
        prop_costes_variables_pct: {
          type: 'number',
          description: '% de costes que son variables (escalan con ventas). Default: 60',
          default: 60,
        },
        // Metadata
        periodo: { type: 'string', description: 'Período base analizado' },
        agencia: { type: 'string', description: 'Código de agencia' },
      },
      required: ['ventas_netas', 'costo_ventas', 'incremento_pct'],
    },
  },

  {
    name: 'escenario_reduccion_costes',
    description: `Modela el ahorro anual y la mejora de márgenes tras una reducción de costes.
Aplica la reducción al costo de ventas y opcionalmente a gastos operacionales (SG&A).
Devuelve ahorro total estimado y comparativa de márgenes bruto, operacional, neto y EBITDA.
Extraer base de Contabilidad y Facturación.`,
    inputSchema: {
      type: 'object',
      properties: {
        ventas_netas:          { type: 'number', description: 'Ventas netas actuales' },
        costo_ventas:          { type: 'number', description: 'Costo de ventas actual' },
        utilidad_operacional:  { type: 'number', description: 'EBIT actual' },
        utilidad_neta:         { type: 'number', description: 'Utilidad neta actual' },
        gastos_operacionales:  { type: 'number', description: 'SG&A actuales. Si no se da, se infiere del EBIT' },
        reduccion_costo_pct: {
          type: 'number',
          description: '% de reducción sobre costo_ventas. Ej: 10 para -10%',
        },
        reduccion_gastos_op_pct: {
          type: 'number',
          description: '% de reducción sobre gastos operacionales. Ej: 5 para -5%. Default: 0',
          default: 0,
        },
        periodo: { type: 'string', description: 'Período base analizado' },
        agencia: { type: 'string', description: 'Código de agencia' },
      },
      required: ['ventas_netas', 'costo_ventas', 'reduccion_costo_pct'],
    },
  },

  {
    name: 'escenario_nueva_deuda',
    description: `Modela el impacto de contratar nueva financiación: cuota mensual, viabilidad financiera
y efecto sobre ratios de endeudamiento y cobertura de intereses.
Calcula cuota por amortización francesa. Alerta si la cobertura cae por debajo de 1.5x o el
endeudamiento supera el 75%.
Extraer base del balance: pasivo_total, activo_total, patrimonio, utilidad_operacional.`,
    inputSchema: {
      type: 'object',
      properties: {
        // Base de endeudamiento
        pasivo_total:         { type: 'number', description: 'Total pasivos actuales' },
        activo_total:         { type: 'number', description: 'Total activos actuales' },
        patrimonio:           { type: 'number', description: 'Patrimonio neto actual' },
        utilidad_operacional: { type: 'number', description: 'EBIT actual (para cobertura de intereses)' },
        gastos_financieros:   { type: 'number', description: 'Gastos financieros actuales' },
        // Parámetros del préstamo
        monto: {
          type: 'number',
          description: 'Importe del nuevo préstamo',
        },
        tasa_anual_pct: {
          type: 'number',
          description: 'Tasa nominal anual en %. Ej: 8.5 para 8.5%',
        },
        plazo_meses: {
          type: 'number',
          description: 'Plazo de amortización en meses. Ej: 60 para 5 años',
        },
        periodo: { type: 'string', description: 'Período base analizado' },
        agencia: { type: 'string', description: 'Código de agencia' },
      },
      required: ['pasivo_total', 'activo_total', 'patrimonio', 'monto', 'tasa_anual_pct', 'plazo_meses'],
    },
  },

  {
    name: 'escenario_mejora_cobro',
    description: `Modela el impacto de reducir los días de cobro a clientes: tesorería liberada
y mejora del ciclo de conversión de efectivo.
Cuantifica el capital de trabajo recuperado al cobrar más rápido.
Extraer base de CxC y Facturación: cxc_promedio, ventas_netas.`,
    inputSchema: {
      type: 'object',
      properties: {
        ventas_netas:  { type: 'number', description: 'Ventas netas anuales' },
        cxc_promedio:  { type: 'number', description: 'Saldo promedio de cuentas por cobrar' },
        dias_cobro_objetivo: {
          type: 'number',
          description: 'Días de cobro objetivo a alcanzar. Debe ser menor al actual para liberar caja',
        },
        // Opcionales para calcular ciclo completo
        costo_ventas:        { type: 'number', description: 'Costo de ventas (para ciclo de efectivo)' },
        inventario_promedio: { type: 'number', description: 'Inventario promedio (para ciclo de efectivo)' },
        compras:             { type: 'number', description: 'Compras anuales (para ciclo de efectivo)' },
        cxp_promedio:        { type: 'number', description: 'CxP promedio (para ciclo de efectivo)' },
        periodo: { type: 'string', description: 'Período base analizado' },
        agencia: { type: 'string', description: 'Código de agencia' },
      },
      required: ['ventas_netas', 'cxc_promedio', 'dias_cobro_objetivo'],
    },
  },

  {
    name: 'escenario_mejora_pago',
    description: `Modela el impacto de extender los días de pago a proveedores: tesorería adicional retenida
y mejora del ciclo de conversión de efectivo.
Cuantifica el capital de trabajo ganado al pagar más tarde (sin penalidades).
Extraer base de CxP: cxp_promedio, compras anuales.`,
    inputSchema: {
      type: 'object',
      properties: {
        compras:      { type: 'number', description: 'Total compras anuales' },
        cxp_promedio: { type: 'number', description: 'Saldo promedio de cuentas por pagar' },
        dias_pago_objetivo: {
          type: 'number',
          description: 'Días de pago objetivo (mayor = más caja retenida). Máximo recomendado: 90 días',
        },
        // Opcionales para ciclo completo
        ventas_netas:        { type: 'number', description: 'Ventas netas (para ciclo de efectivo)' },
        costo_ventas:        { type: 'number', description: 'Costo de ventas (para ciclo de efectivo)' },
        inventario_promedio: { type: 'number', description: 'Inventario promedio (para ciclo de efectivo)' },
        cxc_promedio:        { type: 'number', description: 'CxC promedio (para ciclo de efectivo)' },
        periodo: { type: 'string', description: 'Período base analizado' },
        agencia: { type: 'string', description: 'Código de agencia' },
      },
      required: ['compras', 'cxp_promedio', 'dias_pago_objetivo'],
    },
  },
];

// ── Handler ────────────────────────────────────────────────────────

export async function ejecutarEscenarios(name: string, args: any): Promise<string> {

  // ── escenario_incremento_ventas ────────────────────────────────
  if (name === 'escenario_incremento_ventas') {
    const resultado = modelarIncrementoVentas({
      ventas_netas:   args.ventas_netas,
      costo_ventas:   args.costo_ventas,
      incremento_pct: args.incremento_pct,
      ...(args.utilidad_operacional      !== undefined && { utilidad_operacional:      args.utilidad_operacional      }),
      ...(args.utilidad_neta             !== undefined && { utilidad_neta:             args.utilidad_neta             }),
      ...(args.activo_total              !== undefined && { activo_total:              args.activo_total              }),
      ...(args.patrimonio                !== undefined && { patrimonio:                args.patrimonio                }),
      ...(args.depreciacion_amortizacion !== undefined && { depreciacion_amortizacion: args.depreciacion_amortizacion }),
      ...(args.prop_costes_variables_pct !== undefined && { prop_costes_variables_pct: args.prop_costes_variables_pct }),
    });
    return JSON.stringify({ periodo: args.periodo ?? null, agencia: args.agencia ?? null, ...resultado }, null, 2);
  }

  // ── escenario_reduccion_costes ─────────────────────────────────
  if (name === 'escenario_reduccion_costes') {
    const resultado = modelarReduccionCostes({
      ventas_netas:       args.ventas_netas,
      costo_ventas:       args.costo_ventas,
      reduccion_costo_pct: args.reduccion_costo_pct,
      ...(args.utilidad_operacional    !== undefined && { utilidad_operacional:    args.utilidad_operacional    }),
      ...(args.utilidad_neta           !== undefined && { utilidad_neta:           args.utilidad_neta           }),
      ...(args.gastos_operacionales    !== undefined && { gastos_operacionales:    args.gastos_operacionales    }),
      ...(args.reduccion_gastos_op_pct !== undefined && { reduccion_gastos_op_pct: args.reduccion_gastos_op_pct }),
    });
    return JSON.stringify({ periodo: args.periodo ?? null, agencia: args.agencia ?? null, ...resultado }, null, 2);
  }

  // ── escenario_nueva_deuda ──────────────────────────────────────
  if (name === 'escenario_nueva_deuda') {
    const resultado = modelarNuevaDeuda({
      pasivo_total:   args.pasivo_total,
      activo_total:   args.activo_total,
      patrimonio:     args.patrimonio,
      monto:          args.monto,
      tasa_anual_pct: args.tasa_anual_pct,
      plazo_meses:    args.plazo_meses,
      ...(args.utilidad_operacional !== undefined && { utilidad_operacional: args.utilidad_operacional }),
      ...(args.gastos_financieros   !== undefined && { gastos_financieros:   args.gastos_financieros   }),
    });
    return JSON.stringify({ periodo: args.periodo ?? null, agencia: args.agencia ?? null, ...resultado }, null, 2);
  }

  // ── escenario_mejora_cobro ─────────────────────────────────────
  if (name === 'escenario_mejora_cobro') {
    const resultado = modelarMejoraCobro({
      ventas_netas:        args.ventas_netas,
      cxc_promedio:        args.cxc_promedio,
      dias_cobro_objetivo: args.dias_cobro_objetivo,
      ...(args.costo_ventas        !== undefined && { costo_ventas:        args.costo_ventas        }),
      ...(args.inventario_promedio !== undefined && { inventario_promedio: args.inventario_promedio }),
      ...(args.compras             !== undefined && { compras:             args.compras             }),
      ...(args.cxp_promedio        !== undefined && { cxp_promedio:        args.cxp_promedio        }),
    });
    return JSON.stringify({ periodo: args.periodo ?? null, agencia: args.agencia ?? null, ...resultado }, null, 2);
  }

  // ── escenario_mejora_pago ──────────────────────────────────────
  if (name === 'escenario_mejora_pago') {
    const resultado = modelarMejoraPago({
      compras:            args.compras,
      cxp_promedio:       args.cxp_promedio,
      dias_pago_objetivo: args.dias_pago_objetivo,
      ...(args.ventas_netas        !== undefined && { ventas_netas:        args.ventas_netas        }),
      ...(args.costo_ventas        !== undefined && { costo_ventas:        args.costo_ventas        }),
      ...(args.inventario_promedio !== undefined && { inventario_promedio: args.inventario_promedio }),
      ...(args.cxc_promedio        !== undefined && { cxc_promedio:        args.cxc_promedio        }),
    });
    return JSON.stringify({ periodo: args.periodo ?? null, agencia: args.agencia ?? null, ...resultado }, null, 2);
  }

  throw new Error(`Escenario desconocido: ${name}`);
}
