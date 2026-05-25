// src/engine/calculadora.ts
// Motor de cálculo de KPIs financieros — sin dependencias externas

// ── Tipos base ─────────────────────────────────────────────────────

export type Semaforo = 'verde' | 'amarillo' | 'rojo' | 'n/a';

export interface KPIItem {
  valor:          number | null;
  unidad:         string;
  semaforo:       Semaforo;
  interpretacion: string;
}

// ── Interfaces de entrada ──────────────────────────────────────────

export interface DatosLiquidez {
  activo_corriente: number;
  pasivo_corriente: number;
  inventario?:      number;
  efectivo?:        number;
}

export interface DatosRentabilidad {
  ventas_netas:               number;
  costo_ventas:               number;
  utilidad_operacional?:      number;
  utilidad_neta?:             number;
  activo_total?:              number;
  patrimonio?:                number;
  depreciacion_amortizacion?: number;
  gastos_financieros?:        number;
}

export interface DatosEndeudamiento {
  pasivo_total:          number;
  activo_total:          number;
  patrimonio:            number;
  utilidad_operacional?: number;
  gastos_financieros?:   number;
}

export interface DatosOperacional {
  ventas_netas:        number;
  costo_ventas:        number;
  inventario_promedio?: number;
  cxc_promedio?:        number;
  compras?:             number;
  cxp_promedio?:        number;
}

// ── Interfaces de resultado ────────────────────────────────────────

export interface KPILiquidez {
  razon_corriente:    KPIItem;
  prueba_acida:       KPIItem;
  liquidez_inmediata: KPIItem;
}

export interface KPIRentabilidad {
  margen_bruto:       KPIItem;
  margen_operacional: KPIItem;
  margen_neto:        KPIItem;
  roa:                KPIItem;
  roe:                KPIItem;
  ebitda:             KPIItem;
  margen_ebitda:      KPIItem;
}

export interface KPIEndeudamiento {
  razon_endeudamiento: KPIItem;
  apalancamiento:      KPIItem;
  cobertura_intereses: KPIItem;
}

export interface KPIOperacional {
  rotacion_inventario: KPIItem;
  dias_inventario:     KPIItem;
  rotacion_cxc:        KPIItem;
  dias_cobro:          KPIItem;
  rotacion_cxp:        KPIItem;
  dias_pago:           KPIItem;
  ciclo_efectivo:      KPIItem;
}

export interface KPICompleto {
  liquidez?:      KPILiquidez;
  rentabilidad?:  KPIRentabilidad;
  endeudamiento?: KPIEndeudamiento;
  operacional?:   KPIOperacional;
}

export interface PuntoTendencia {
  periodo:    string;
  kpis:       KPILiquidez | KPIRentabilidad | KPIEndeudamiento | KPIOperacional;
  variacion?: Record<string, number | null>;
}

// ── Helpers internos ───────────────────────────────────────────────

function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

function safe(a: number, b: number | undefined): number | null {
  if (b === undefined || b === 0) return null;
  return r2(a / b);
}

function pct(a: number, b: number | undefined): number | null {
  if (b === undefined || b === 0) return null;
  return r2((a / b) * 100);
}

function item(
  valor: number | null,
  unidad: string,
  fn: (v: number) => { semaforo: Semaforo; interpretacion: string },
): KPIItem {
  if (valor === null) {
    return { valor: null, unidad, semaforo: 'n/a', interpretacion: 'Datos insuficientes' };
  }
  return { valor, unidad, ...fn(valor) };
}

function variacionPct(curr: number | null, prev: number | null): number | null {
  if (curr === null || prev === null || prev === 0) return null;
  return r2(((curr - prev) / Math.abs(prev)) * 100);
}

// ── Liquidez ───────────────────────────────────────────────────────

export function calcularLiquidez(d: DatosLiquidez): KPILiquidez {
  const razon_corriente = item(
    safe(d.activo_corriente, d.pasivo_corriente), 'veces',
    v => v >= 2
      ? { semaforo: 'verde',    interpretacion: 'Excelente: cubre ampliamente las obligaciones corrientes' }
      : v >= 1
        ? { semaforo: 'amarillo', interpretacion: 'Aceptable: cubre las obligaciones corrientes' }
        : { semaforo: 'rojo',     interpretacion: 'Riesgo: activo corriente insuficiente para cubrir el pasivo corriente' },
  );

  const prueba_acida = item(
    d.inventario !== undefined ? safe(d.activo_corriente - d.inventario, d.pasivo_corriente) : null,
    'veces',
    v => v >= 1
      ? { semaforo: 'verde',    interpretacion: 'Sólida: sin inventarios cubre el pasivo corriente' }
      : v >= 0.5
        ? { semaforo: 'amarillo', interpretacion: 'Moderada: dependencia parcial del inventario' }
        : { semaforo: 'rojo',     interpretacion: 'Débil: alta dependencia del inventario para cubrir deudas corrientes' },
  );

  const liquidez_inmediata = item(
    d.efectivo !== undefined ? safe(d.efectivo, d.pasivo_corriente) : null,
    'veces',
    v => v >= 0.3
      ? { semaforo: 'verde',    interpretacion: 'Suficiente: efectivo cubre ≥ 30% del pasivo corriente' }
      : v >= 0.1
        ? { semaforo: 'amarillo', interpretacion: 'Moderada: efectivo limitado pero operacional' }
        : { semaforo: 'rojo',     interpretacion: 'Crítica: efectivo insuficiente frente al pasivo corriente' },
  );

  return { razon_corriente, prueba_acida, liquidez_inmediata };
}

// ── Rentabilidad ───────────────────────────────────────────────────

export function calcularRentabilidad(d: DatosRentabilidad): KPIRentabilidad {
  const utilidad_bruta = d.ventas_netas - d.costo_ventas;

  const margen_bruto = item(
    pct(utilidad_bruta, d.ventas_netas), '%',
    v => v >= 40
      ? { semaforo: 'verde',    interpretacion: 'Alto: buena cobertura sobre costos directos' }
      : v >= 20
        ? { semaforo: 'amarillo', interpretacion: 'Moderado' }
        : { semaforo: 'rojo',     interpretacion: 'Bajo: costos directos consumen gran parte de las ventas' },
  );

  const margen_operacional = item(
    d.utilidad_operacional !== undefined ? pct(d.utilidad_operacional, d.ventas_netas) : null, '%',
    v => v >= 15
      ? { semaforo: 'verde',    interpretacion: 'Bueno: operación genera rendimiento sólido' }
      : v >= 5
        ? { semaforo: 'amarillo', interpretacion: 'Aceptable' }
        : v >= 0
          ? { semaforo: 'rojo',   interpretacion: 'Marginal: operación apenas rentable' }
          : { semaforo: 'rojo',   interpretacion: 'Negativo: pérdida operacional' },
  );

  const margen_neto = item(
    d.utilidad_neta !== undefined ? pct(d.utilidad_neta, d.ventas_netas) : null, '%',
    v => v >= 10
      ? { semaforo: 'verde',    interpretacion: 'Bueno: retorno neto sólido sobre ventas' }
      : v >= 3
        ? { semaforo: 'amarillo', interpretacion: 'Aceptable' }
        : v >= 0
          ? { semaforo: 'rojo',   interpretacion: 'Marginal: empresa apenas genera beneficio' }
          : { semaforo: 'rojo',   interpretacion: 'Negativo: operación con pérdidas' },
  );

  const roa = item(
    d.utilidad_neta !== undefined && d.activo_total !== undefined
      ? pct(d.utilidad_neta, d.activo_total) : null, '%',
    v => v >= 10
      ? { semaforo: 'verde',    interpretacion: 'Excelente uso de activos' }
      : v >= 5
        ? { semaforo: 'amarillo', interpretacion: 'Aceptable' }
        : { semaforo: 'rojo',     interpretacion: 'Bajo rendimiento de activos' },
  );

  const roe = item(
    d.utilidad_neta !== undefined && d.patrimonio !== undefined
      ? pct(d.utilidad_neta, d.patrimonio) : null, '%',
    v => v >= 15
      ? { semaforo: 'verde',    interpretacion: 'Excelente retorno para accionistas' }
      : v >= 8
        ? { semaforo: 'amarillo', interpretacion: 'Aceptable' }
        : { semaforo: 'rojo',     interpretacion: 'Bajo retorno sobre patrimonio' },
  );

  // EBITDA = Utilidad operacional + D&A
  const ebitdaValor = d.utilidad_operacional !== undefined
    ? d.utilidad_operacional + (d.depreciacion_amortizacion ?? 0)
    : null;

  const ebitda = item(ebitdaValor, 'moneda', v => ({
    semaforo: v >= 0 ? 'verde' : 'rojo' as Semaforo,
    interpretacion: v >= 0
      ? 'EBITDA positivo: generación de caja operativa'
      : 'EBITDA negativo: operación destruye caja',
  }));

  const margen_ebitda = item(
    ebitdaValor !== null ? pct(ebitdaValor, d.ventas_netas) : null, '%',
    v => v >= 20
      ? { semaforo: 'verde',    interpretacion: 'Excelente generación de caja respecto a ventas' }
      : v >= 10
        ? { semaforo: 'amarillo', interpretacion: 'Aceptable' }
        : v >= 0
          ? { semaforo: 'rojo',   interpretacion: 'Bajo' }
          : { semaforo: 'rojo',   interpretacion: 'EBITDA negativo' },
  );

  return { margen_bruto, margen_operacional, margen_neto, roa, roe, ebitda, margen_ebitda };
}

// ── Endeudamiento ──────────────────────────────────────────────────

export function calcularEndeudamiento(d: DatosEndeudamiento): KPIEndeudamiento {
  const razon_endeudamiento = item(
    pct(d.pasivo_total, d.activo_total), '%',
    v => v <= 40
      ? { semaforo: 'verde',    interpretacion: 'Bajo: estructura financiera sólida' }
      : v <= 60
        ? { semaforo: 'amarillo', interpretacion: 'Moderado: dentro de rangos normales' }
        : { semaforo: 'rojo',     interpretacion: 'Alto: riesgo financiero elevado' },
  );

  const apalancamiento = item(
    safe(d.pasivo_total, d.patrimonio), 'veces',
    v => v <= 1
      ? { semaforo: 'verde',    interpretacion: 'Conservador: deuda ≤ patrimonio' }
      : v <= 2
        ? { semaforo: 'amarillo', interpretacion: 'Moderado' }
        : { semaforo: 'rojo',     interpretacion: 'Alto apalancamiento: mayor riesgo para acreedores' },
  );

  const cobertura_intereses = item(
    d.utilidad_operacional !== undefined && d.gastos_financieros !== undefined
      ? safe(d.utilidad_operacional, d.gastos_financieros) : null,
    'veces',
    v => v >= 3
      ? { semaforo: 'verde',    interpretacion: 'Buena cobertura de gastos financieros' }
      : v >= 1.5
        ? { semaforo: 'amarillo', interpretacion: 'Aceptable' }
        : v >= 1
          ? { semaforo: 'rojo',   interpretacion: 'Ajustada: apenas cubre gastos financieros' }
          : { semaforo: 'rojo',   interpretacion: 'Crítico: no cubre gastos financieros' },
  );

  return { razon_endeudamiento, apalancamiento, cobertura_intereses };
}

// ── Operacional ────────────────────────────────────────────────────

export function calcularOperacional(d: DatosOperacional): KPIOperacional {
  const rotInvValor  = d.inventario_promedio !== undefined
    ? safe(d.costo_ventas, d.inventario_promedio) : null;
  const diasInvValor = rotInvValor !== null ? r2(365 / rotInvValor) : null;

  const rotCxCValor  = d.cxc_promedio !== undefined
    ? safe(d.ventas_netas, d.cxc_promedio) : null;
  const diasCobValor = rotCxCValor !== null ? r2(365 / rotCxCValor) : null;

  const rotCxPValor  = d.compras !== undefined && d.cxp_promedio !== undefined
    ? safe(d.compras, d.cxp_promedio) : null;
  const diasPagValor = rotCxPValor !== null ? r2(365 / rotCxPValor) : null;

  const cicloValor = diasInvValor !== null && diasCobValor !== null && diasPagValor !== null
    ? r2(diasInvValor + diasCobValor - diasPagValor) : null;

  const rotacion_inventario = item(rotInvValor, 'veces/año', v => ({
    semaforo: v >= 12 ? 'verde' : v >= 6 ? 'amarillo' : 'rojo' as Semaforo,
    interpretacion: v >= 12
      ? 'Excelente rotación de inventario'
      : v >= 6 ? 'Rotación aceptable' : 'Inventario lento: capital inmovilizado',
  }));

  const dias_inventario = item(diasInvValor, 'días', v => ({
    semaforo: v <= 30 ? 'verde' : v <= 60 ? 'amarillo' : 'rojo' as Semaforo,
    interpretacion: v <= 30
      ? 'Excelente: rotación rápida de existencias'
      : v <= 60 ? 'Aceptable' : 'Lento: capital inmovilizado en existencias',
  }));

  const rotacion_cxc = item(rotCxCValor, 'veces/año', v => ({
    semaforo: v >= 12 ? 'verde' : v >= 6 ? 'amarillo' : 'rojo' as Semaforo,
    interpretacion: v >= 12
      ? 'Cobro muy ágil'
      : v >= 6 ? 'Cobro normal' : 'Cobro lento: riesgo de incobrables',
  }));

  const dias_cobro = item(diasCobValor, 'días', v => ({
    semaforo: v <= 30 ? 'verde' : v <= 60 ? 'amarillo' : 'rojo' as Semaforo,
    interpretacion: v <= 30
      ? 'Excelente: cobro rápido'
      : v <= 60 ? 'Normal' : 'Lento: presión sobre liquidez',
  }));

  const rotacion_cxp = item(rotCxPValor, 'veces/año', v => ({
    semaforo: v <= 12 ? 'verde' : v <= 24 ? 'amarillo' : 'rojo' as Semaforo,
    interpretacion: v <= 12
      ? 'Buen aprovechamiento del crédito de proveedores'
      : v <= 24 ? 'Moderado' : 'Pago muy rápido: subaprovecha crédito de proveedores',
  }));

  const dias_pago = item(diasPagValor, 'días', v => ({
    semaforo: v >= 30 ? 'verde' : v >= 15 ? 'amarillo' : 'rojo' as Semaforo,
    interpretacion: v >= 30
      ? 'Aprovecha bien el crédito de proveedores'
      : v >= 15 ? 'Moderado' : 'Pago muy rápido: no aprovecha crédito disponible',
  }));

  const ciclo_efectivo = item(cicloValor, 'días', v => ({
    semaforo: v <= 30 ? 'verde' : v <= 60 ? 'amarillo' : 'rojo' as Semaforo,
    interpretacion: v <= 30
      ? 'Ciclo corto: alta eficiencia en conversión a efectivo'
      : v <= 60 ? 'Normal' : 'Ciclo largo: mayor necesidad de capital de trabajo',
  }));

  return {
    rotacion_inventario,
    dias_inventario,
    rotacion_cxc,
    dias_cobro,
    rotacion_cxp,
    dias_pago,
    ciclo_efectivo,
  };
}

// ── KPI completo ───────────────────────────────────────────────────

export function calcularTodos(args: {
  liquidez?:      DatosLiquidez;
  rentabilidad?:  DatosRentabilidad;
  endeudamiento?: DatosEndeudamiento;
  operacional?:   DatosOperacional;
}): KPICompleto {
  return {
    liquidez:      args.liquidez      ? calcularLiquidez(args.liquidez)           : undefined,
    rentabilidad:  args.rentabilidad  ? calcularRentabilidad(args.rentabilidad)   : undefined,
    endeudamiento: args.endeudamiento ? calcularEndeudamiento(args.endeudamiento) : undefined,
    operacional:   args.operacional   ? calcularOperacional(args.operacional)     : undefined,
  };
}

// ── Tendencia ──────────────────────────────────────────────────────

type Calculadora = (d: any) =>
  KPILiquidez | KPIRentabilidad | KPIEndeudamiento | KPIOperacional;

export function calcularTendencia(
  periodos: Array<{ periodo: string } & Record<string, number>>,
  calcFn: Calculadora,
): PuntoTendencia[] {
  const puntos: PuntoTendencia[] = [];

  for (let i = 0; i < periodos.length; i++) {
    const { periodo, ...datos } = periodos[i];
    const kpis = calcFn(datos);
    let variacion: Record<string, number | null> | undefined;

    if (i > 0) {
      const prevKpis = puntos[i - 1].kpis as unknown as Record<string, KPIItem>;
      const currKpis = kpis as unknown as Record<string, KPIItem>;
      variacion = {};
      for (const key of Object.keys(currKpis)) {
        variacion[key] = variacionPct(currKpis[key]?.valor ?? null, prevKpis[key]?.valor ?? null);
      }
    }

    puntos.push({ periodo, kpis, variacion });
  }

  return puntos;
}

// ── Resumen ejecutivo ──────────────────────────────────────────────

export function resumenSemaforos(kpis: KPICompleto): Record<string, Semaforo> {
  const res: Record<string, Semaforo> = {};
  const secciones = kpis as Record<string, Record<string, KPIItem> | undefined>;

  for (const [seccion, items] of Object.entries(secciones)) {
    if (!items) continue;
    for (const [nombre, item] of Object.entries(items as Record<string, KPIItem>)) {
      res[`${seccion}.${nombre}`] = item.semaforo;
    }
  }
  return res;
}
