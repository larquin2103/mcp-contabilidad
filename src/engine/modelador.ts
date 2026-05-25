// src/engine/modelador.ts
// Modelador de escenarios financieros — sin dependencias externas (solo calculadora)

import {
  calcularRentabilidad,
  calcularEndeudamiento,
  calcularOperacional,
  type KPIItem,
  type Semaforo,
  type DatosRentabilidad,
  type DatosEndeudamiento,
  type DatosOperacional,
} from './calculadora.js';

// ── Tipos de salida ────────────────────────────────────────────────

export type AlertaViabilidad = '✅ viable' | '⚠️ ajustado' | '🚨 riesgo';

export interface ComparativaKPI {
  kpi:              string;
  unidad:           string;
  antes:            number | null;
  despues:          number | null;
  delta_abs:        number | null;
  delta_pct:        number | null;
  semaforo_antes:   Semaforo;
  semaforo_despues: Semaforo;
}

export interface ResultadoEscenario {
  escenario:      string;
  descripcion:    string;
  alerta:         AlertaViabilidad;
  resumen:        string;
  metricas_clave: Record<string, number | null>;
  comparativa:    ComparativaKPI[];
}

// ── Interfaces de parámetros ───────────────────────────────────────

export interface ParamsIncrementoVentas {
  ventas_netas:               number;
  costo_ventas:               number;
  utilidad_operacional?:      number;
  utilidad_neta?:             number;
  activo_total?:              number;
  patrimonio?:                number;
  depreciacion_amortizacion?: number;
  /** % de incremento en ventas. Ej: 15 → +15% */
  incremento_pct: number;
  /** % de costos que son variables (escalan con ventas). Default: 60 */
  prop_costes_variables_pct?: number;
}

export interface ParamsReduccionCostes {
  ventas_netas:          number;
  costo_ventas:          number;
  utilidad_operacional?: number;
  utilidad_neta?:        number;
  /** Gastos operacionales (SG&A). Si no se da, se infiere de utilidad_operacional */
  gastos_operacionales?: number;
  /** % de reducción sobre costo_ventas. Ej: 10 → -10% */
  reduccion_costo_pct: number;
  /** % de reducción sobre gastos operacionales. Opcional */
  reduccion_gastos_op_pct?: number;
}

export interface ParamsNuevaDeuda {
  pasivo_total:          number;
  activo_total:          number;
  patrimonio:            number;
  utilidad_operacional?: number;
  gastos_financieros?:   number;
  /** Monto del nuevo préstamo */
  monto:         number;
  /** Tasa nominal anual en %. Ej: 8.5 → 8.5% */
  tasa_anual_pct: number;
  /** Plazo en meses */
  plazo_meses:   number;
}

export interface ParamsMejoraCobro {
  ventas_netas:  number;
  cxc_promedio:  number;
  /** Días de cobro objetivo a alcanzar */
  dias_cobro_objetivo: number;
  // Opcionales para calcular ciclo completo
  costo_ventas?:        number;
  inventario_promedio?: number;
  compras?:             number;
  cxp_promedio?:        number;
}

export interface ParamsMejoraPago {
  compras:      number;
  cxp_promedio: number;
  /** Días de pago objetivo (mayor = mejor uso del crédito proveedor) */
  dias_pago_objetivo: number;
  // Opcionales para calcular ciclo completo
  ventas_netas?:        number;
  costo_ventas?:        number;
  inventario_promedio?: number;
  cxc_promedio?:        number;
}

// ── Helpers internos ───────────────────────────────────────────────

function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

function deltaPct(a: number | null, b: number | null): number | null {
  if (a === null || b === null || a === 0) return null;
  return r2(((b - a) / Math.abs(a)) * 100);
}

function cmp(kpi: string, antes: KPIItem, despues: KPIItem): ComparativaKPI {
  const da = antes.valor !== null && despues.valor !== null
    ? r2(despues.valor - antes.valor) : null;
  return {
    kpi,
    unidad:           antes.unidad,
    antes:            antes.valor,
    despues:          despues.valor,
    delta_abs:        da,
    delta_pct:        deltaPct(antes.valor, despues.valor),
    semaforo_antes:   antes.semaforo,
    semaforo_despues: despues.semaforo,
  };
}

function contarRojos(comparativa: ComparativaKPI[]): number {
  return comparativa.filter(c => c.semaforo_despues === 'rojo').length;
}

// ── 1. Incremento de ventas ────────────────────────────────────────

export function modelarIncrementoVentas(p: ParamsIncrementoVentas): ResultadoEscenario {
  const {
    ventas_netas, costo_ventas, utilidad_operacional, utilidad_neta,
    activo_total, patrimonio, depreciacion_amortizacion,
    incremento_pct, prop_costes_variables_pct = 60,
  } = p;

  const cv_ratio     = prop_costes_variables_pct / 100;
  const ventas_nueva = r2(ventas_netas * (1 + incremento_pct / 100));
  const delta_ventas = ventas_nueva - ventas_netas;

  const costo_variable = costo_ventas * cv_ratio;
  const costo_fijo     = costo_ventas * (1 - cv_ratio);
  const costo_nuevo    = r2(costo_fijo + costo_variable * (1 + incremento_pct / 100));
  const delta_costo    = costo_nuevo - costo_ventas;

  const utilidad_op_nueva = utilidad_operacional !== undefined
    ? r2(utilidad_operacional + delta_ventas - delta_costo)
    : undefined;

  // Mantener la misma proporción neta/operacional para estimar utilidad_neta
  const ratio_neto = utilidad_neta !== undefined && utilidad_operacional !== undefined && utilidad_operacional !== 0
    ? utilidad_neta / utilidad_operacional : undefined;
  const utilidad_neta_nueva = utilidad_op_nueva !== undefined && ratio_neto !== undefined
    ? r2(utilidad_op_nueva * ratio_neto) : undefined;

  const datosBase: DatosRentabilidad = {
    ventas_netas, costo_ventas, utilidad_operacional, utilidad_neta,
    activo_total, patrimonio, depreciacion_amortizacion,
  };
  const datosNuevo: DatosRentabilidad = {
    ventas_netas: ventas_nueva, costo_ventas: costo_nuevo,
    utilidad_operacional: utilidad_op_nueva, utilidad_neta: utilidad_neta_nueva,
    activo_total, patrimonio, depreciacion_amortizacion,
  };

  const base  = calcularRentabilidad(datosBase);
  const nuevo = calcularRentabilidad(datosNuevo);

  const comparativa: ComparativaKPI[] = [
    cmp('margen_bruto',       base.margen_bruto,       nuevo.margen_bruto),
    cmp('margen_operacional', base.margen_operacional, nuevo.margen_operacional),
    cmp('margen_neto',        base.margen_neto,        nuevo.margen_neto),
    cmp('ebitda',             base.ebitda,             nuevo.ebitda),
    cmp('margen_ebitda',      base.margen_ebitda,      nuevo.margen_ebitda),
  ];

  const rojos  = contarRojos(comparativa);
  const ebitdaN = nuevo.ebitda.valor;
  const alerta: AlertaViabilidad =
    ebitdaN !== null && ebitdaN < 0        ? '🚨 riesgo'
    : rojos >= 3                           ? '🚨 riesgo'
    : rojos >= 1 || (ebitdaN !== null && ebitdaN < (base.ebitda.valor ?? 0)) ? '⚠️ ajustado'
    : '✅ viable';

  return {
    escenario:   'incremento_ventas',
    descripcion: `Incremento de ventas del ${incremento_pct}% con ${prop_costes_variables_pct}% de costes variables.`,
    alerta,
    resumen: `Ventas: ${ventas_netas.toLocaleString()} → ${ventas_nueva.toLocaleString()} (+${r2(delta_ventas).toLocaleString()}). ` +
             `EBITDA: ${base.ebitda.valor?.toLocaleString() ?? 'n/a'} → ${ebitdaN?.toLocaleString() ?? 'n/a'}.`,
    metricas_clave: {
      ventas_antes:       ventas_netas,
      ventas_despues:     ventas_nueva,
      delta_ventas:       r2(delta_ventas),
      costo_antes:        costo_ventas,
      costo_despues:      costo_nuevo,
      delta_costo:        r2(delta_costo),
      margen_contribucion_pct: r2((1 - cv_ratio) * 100),
      ebitda_antes:       base.ebitda.valor,
      ebitda_despues:     ebitdaN,
    },
    comparativa,
  };
}

// ── 2. Reducción de costes ─────────────────────────────────────────

export function modelarReduccionCostes(p: ParamsReduccionCostes): ResultadoEscenario {
  const {
    ventas_netas, costo_ventas, utilidad_operacional, utilidad_neta,
    gastos_operacionales, reduccion_costo_pct, reduccion_gastos_op_pct = 0,
  } = p;

  const costo_nuevo    = r2(costo_ventas * (1 - reduccion_costo_pct / 100));
  const ahorro_costo   = r2(costo_ventas - costo_nuevo);

  // Inferir gastos_op si no se proveen
  const gastos_op = gastos_operacionales !== undefined
    ? gastos_operacionales
    : utilidad_operacional !== undefined
      ? r2(ventas_netas - costo_ventas - utilidad_operacional)
      : undefined;

  const gastos_op_nuevo  = gastos_op !== undefined
    ? r2(gastos_op * (1 - reduccion_gastos_op_pct / 100)) : undefined;
  const ahorro_gastos_op = gastos_op !== undefined && gastos_op_nuevo !== undefined
    ? r2(gastos_op - gastos_op_nuevo) : 0;

  const ahorro_total = r2(ahorro_costo + (ahorro_gastos_op ?? 0));

  const utilidad_op_nueva = utilidad_operacional !== undefined
    ? r2(utilidad_operacional + ahorro_total) : undefined;

  const ratio_neto = utilidad_neta !== undefined && utilidad_operacional !== undefined && utilidad_operacional !== 0
    ? utilidad_neta / utilidad_operacional : undefined;
  const utilidad_neta_nueva = utilidad_op_nueva !== undefined && ratio_neto !== undefined
    ? r2(utilidad_op_nueva * ratio_neto) : undefined;

  const base  = calcularRentabilidad({ ventas_netas, costo_ventas, utilidad_operacional, utilidad_neta });
  const nuevo = calcularRentabilidad({
    ventas_netas, costo_ventas: costo_nuevo,
    utilidad_operacional: utilidad_op_nueva, utilidad_neta: utilidad_neta_nueva,
  });

  const comparativa: ComparativaKPI[] = [
    cmp('margen_bruto',       base.margen_bruto,       nuevo.margen_bruto),
    cmp('margen_operacional', base.margen_operacional, nuevo.margen_operacional),
    cmp('margen_neto',        base.margen_neto,        nuevo.margen_neto),
    cmp('ebitda',             base.ebitda,             nuevo.ebitda),
    cmp('margen_ebitda',      base.margen_ebitda,      nuevo.margen_ebitda),
  ];

  const rojos  = contarRojos(comparativa);
  const alerta: AlertaViabilidad =
    nuevo.margen_bruto.valor !== null && nuevo.margen_bruto.valor < 0 ? '🚨 riesgo'
    : rojos >= 2                                                       ? '🚨 riesgo'
    : rojos >= 1                                                       ? '⚠️ ajustado'
    : '✅ viable';

  return {
    escenario:   'reduccion_costes',
    descripcion: `Reducción del ${reduccion_costo_pct}% en costo de ventas` +
                 (reduccion_gastos_op_pct > 0 ? ` y ${reduccion_gastos_op_pct}% en gastos operacionales.` : '.'),
    alerta,
    resumen: `Ahorro anual estimado: ${ahorro_total.toLocaleString()}. ` +
             `Margen bruto: ${base.margen_bruto.valor?.toFixed(1) ?? 'n/a'}% → ${nuevo.margen_bruto.valor?.toFixed(1) ?? 'n/a'}%.`,
    metricas_clave: {
      costo_ventas_antes:     costo_ventas,
      costo_ventas_despues:   costo_nuevo,
      ahorro_costo_ventas:    ahorro_costo,
      gastos_op_antes:        gastos_op ?? null,
      gastos_op_despues:      gastos_op_nuevo ?? null,
      ahorro_gastos_op:       ahorro_gastos_op,
      ahorro_total_anual:     ahorro_total,
    },
    comparativa,
  };
}

// ── 3. Nueva deuda ─────────────────────────────────────────────────

export function modelarNuevaDeuda(p: ParamsNuevaDeuda): ResultadoEscenario {
  const {
    pasivo_total, activo_total, patrimonio, utilidad_operacional, gastos_financieros,
    monto, tasa_anual_pct, plazo_meses,
  } = p;

  // Cuota mensual — fórmula de amortización francesa
  const tasa_mensual = tasa_anual_pct / 100 / 12;
  const cuota_mensual = tasa_mensual === 0
    ? r2(monto / plazo_meses)
    : r2(monto * tasa_mensual / (1 - Math.pow(1 + tasa_mensual, -plazo_meses)));

  // Intereses del primer año (aproximación conservadora: capital completo × tasa)
  const intereses_anio1 = r2(monto * tasa_anual_pct / 100);
  const cuota_anual     = r2(cuota_mensual * 12);

  const pasivo_nuevo  = r2(pasivo_total + monto);
  const gastos_fin_nuevo = r2((gastos_financieros ?? 0) + intereses_anio1);

  const baseDeuda: DatosEndeudamiento = {
    pasivo_total, activo_total, patrimonio,
    utilidad_operacional, gastos_financieros,
  };
  const nuevoDeuda: DatosEndeudamiento = {
    pasivo_total: pasivo_nuevo, activo_total, patrimonio,
    utilidad_operacional, gastos_financieros: gastos_fin_nuevo,
  };

  const base  = calcularEndeudamiento(baseDeuda);
  const nuevo = calcularEndeudamiento(nuevoDeuda);

  const comparativa: ComparativaKPI[] = [
    cmp('razon_endeudamiento', base.razon_endeudamiento, nuevo.razon_endeudamiento),
    cmp('apalancamiento',      base.apalancamiento,      nuevo.apalancamiento),
    cmp('cobertura_intereses', base.cobertura_intereses, nuevo.cobertura_intereses),
  ];

  const cobNew  = nuevo.cobertura_intereses.valor;
  const endNew  = nuevo.razon_endeudamiento.valor;
  const alerta: AlertaViabilidad =
    (cobNew !== null && cobNew < 1.5) || (endNew !== null && endNew > 75) ? '🚨 riesgo'
    : (cobNew !== null && cobNew < 3)  || (endNew !== null && endNew > 60) ? '⚠️ ajustado'
    : '✅ viable';

  return {
    escenario:   'nueva_deuda',
    descripcion: `Préstamo de ${monto.toLocaleString()} al ${tasa_anual_pct}% anual a ${plazo_meses} meses.`,
    alerta,
    resumen: `Cuota mensual: ${cuota_mensual.toLocaleString()}. ` +
             `Cobertura de intereses: ${base.cobertura_intereses.valor?.toFixed(2) ?? 'n/a'} → ${cobNew?.toFixed(2) ?? 'n/a'} veces.`,
    metricas_clave: {
      monto_prestamo:      monto,
      tasa_anual_pct,
      plazo_meses,
      cuota_mensual,
      cuota_anual,
      intereses_primer_anio: intereses_anio1,
      pasivo_antes:        pasivo_total,
      pasivo_despues:      pasivo_nuevo,
    },
    comparativa,
  };
}

// ── 4. Mejora de cobro ─────────────────────────────────────────────

export function modelarMejoraCobro(p: ParamsMejoraCobro): ResultadoEscenario {
  const {
    ventas_netas, cxc_promedio, dias_cobro_objetivo,
    costo_ventas, inventario_promedio, compras, cxp_promedio,
  } = p;

  const dias_cobro_actual = r2((cxc_promedio / ventas_netas) * 365);
  const cxc_nuevo         = r2(ventas_netas * dias_cobro_objetivo / 365);
  const tesoreria_liberada = r2(cxc_promedio - cxc_nuevo);

  const tieneOperacional = costo_ventas !== undefined;

  const baseOp: DatosOperacional | undefined = tieneOperacional ? {
    ventas_netas, costo_ventas: costo_ventas!,
    inventario_promedio, cxc_promedio, compras, cxp_promedio,
  } : undefined;

  const nuevoOp: DatosOperacional | undefined = tieneOperacional ? {
    ventas_netas, costo_ventas: costo_ventas!,
    inventario_promedio, cxc_promedio: cxc_nuevo, compras, cxp_promedio,
  } : undefined;

  const base  = baseOp ? calcularOperacional(baseOp)  : null;
  const nuevo = nuevoOp ? calcularOperacional(nuevoOp) : null;

  // Si no hay datos operacionales completos, fabricar KPIItems manualmente para la comparativa de CxC
  const comparativa: ComparativaKPI[] = [];

  if (base && nuevo) {
    comparativa.push(
      cmp('dias_cobro',        base.dias_cobro,        nuevo.dias_cobro),
      cmp('rotacion_cxc',      base.rotacion_cxc,      nuevo.rotacion_cxc),
    );
    if (base.ciclo_efectivo.valor !== null || nuevo.ciclo_efectivo.valor !== null) {
      comparativa.push(cmp('ciclo_efectivo', base.ciclo_efectivo, nuevo.ciclo_efectivo));
    }
  } else {
    // Comparativa mínima sin calcularOperacional
    comparativa.push({
      kpi: 'dias_cobro', unidad: 'días',
      antes: dias_cobro_actual, despues: dias_cobro_objetivo,
      delta_abs: r2(dias_cobro_objetivo - dias_cobro_actual),
      delta_pct: deltaPct(dias_cobro_actual, dias_cobro_objetivo),
      semaforo_antes:   dias_cobro_actual <= 30 ? 'verde' : dias_cobro_actual <= 60 ? 'amarillo' : 'rojo',
      semaforo_despues: dias_cobro_objetivo <= 30 ? 'verde' : dias_cobro_objetivo <= 60 ? 'amarillo' : 'rojo',
    });
  }

  const mejora = dias_cobro_objetivo < dias_cobro_actual;
  const alerta: AlertaViabilidad =
    !mejora                          ? '🚨 riesgo'
    : dias_cobro_objetivo > 60       ? '⚠️ ajustado'
    : tesoreria_liberada <= 0        ? '⚠️ ajustado'
    : '✅ viable';

  return {
    escenario:   'mejora_cobro',
    descripcion: `Reducción de días de cobro de ${dias_cobro_actual} a ${dias_cobro_objetivo} días.`,
    alerta,
    resumen: `Días de cobro: ${dias_cobro_actual} → ${dias_cobro_objetivo} días. ` +
             `Tesorería liberada: ${tesoreria_liberada.toLocaleString()}.`,
    metricas_clave: {
      dias_cobro_actual,
      dias_cobro_objetivo,
      delta_dias:        r2(dias_cobro_objetivo - dias_cobro_actual),
      cxc_antes:         cxc_promedio,
      cxc_despues:       cxc_nuevo,
      tesoreria_liberada,
    },
    comparativa,
  };
}

// ── 5. Mejora de pago ──────────────────────────────────────────────

export function modelarMejoraPago(p: ParamsMejoraPago): ResultadoEscenario {
  const {
    compras, cxp_promedio, dias_pago_objetivo,
    ventas_netas, costo_ventas, inventario_promedio, cxc_promedio,
  } = p;

  const dias_pago_actual   = r2((cxp_promedio / compras) * 365);
  const cxp_nuevo          = r2(compras * dias_pago_objetivo / 365);
  const tesoreria_retenida = r2(cxp_nuevo - cxp_promedio);  // positivo = más caja retenida

  const tieneOperacional = ventas_netas !== undefined && costo_ventas !== undefined;

  const baseOp: DatosOperacional | undefined = tieneOperacional ? {
    ventas_netas: ventas_netas!, costo_ventas: costo_ventas!,
    inventario_promedio, cxc_promedio, compras, cxp_promedio,
  } : undefined;

  const nuevoOp: DatosOperacional | undefined = tieneOperacional ? {
    ventas_netas: ventas_netas!, costo_ventas: costo_ventas!,
    inventario_promedio, cxc_promedio, compras, cxp_promedio: cxp_nuevo,
  } : undefined;

  const base  = baseOp  ? calcularOperacional(baseOp)  : null;
  const nuevo = nuevoOp ? calcularOperacional(nuevoOp) : null;

  const comparativa: ComparativaKPI[] = [];

  if (base && nuevo) {
    comparativa.push(
      cmp('dias_pago',    base.dias_pago,    nuevo.dias_pago),
      cmp('rotacion_cxp', base.rotacion_cxp, nuevo.rotacion_cxp),
    );
    if (base.ciclo_efectivo.valor !== null || nuevo.ciclo_efectivo.valor !== null) {
      comparativa.push(cmp('ciclo_efectivo', base.ciclo_efectivo, nuevo.ciclo_efectivo));
    }
  } else {
    comparativa.push({
      kpi: 'dias_pago', unidad: 'días',
      antes: dias_pago_actual, despues: dias_pago_objetivo,
      delta_abs: r2(dias_pago_objetivo - dias_pago_actual),
      delta_pct: deltaPct(dias_pago_actual, dias_pago_objetivo),
      semaforo_antes:   dias_pago_actual >= 30 ? 'verde' : dias_pago_actual >= 15 ? 'amarillo' : 'rojo',
      semaforo_despues: dias_pago_objetivo >= 30 ? 'verde' : dias_pago_objetivo >= 15 ? 'amarillo' : 'rojo',
    });
  }

  const mejora = dias_pago_objetivo > dias_pago_actual;
  const alerta: AlertaViabilidad =
    dias_pago_objetivo < 15     ? '🚨 riesgo'
    : !mejora                   ? '⚠️ ajustado'
    : dias_pago_objetivo < 30   ? '⚠️ ajustado'
    : '✅ viable';

  return {
    escenario:   'mejora_pago',
    descripcion: `Extensión de días de pago a proveedores de ${dias_pago_actual} a ${dias_pago_objetivo} días.`,
    alerta,
    resumen: `Días de pago: ${dias_pago_actual} → ${dias_pago_objetivo} días. ` +
             `Tesorería adicional retenida: ${tesoreria_retenida.toLocaleString()}.`,
    metricas_clave: {
      dias_pago_actual,
      dias_pago_objetivo,
      delta_dias:          r2(dias_pago_objetivo - dias_pago_actual),
      cxp_antes:           cxp_promedio,
      cxp_despues:         cxp_nuevo,
      tesoreria_retenida,
    },
    comparativa,
  };
}
