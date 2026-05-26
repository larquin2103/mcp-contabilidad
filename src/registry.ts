import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const cfg = JSON.parse(
  readFileSync(join(__dirname, '../config/agencias.json'), 'utf-8')
);

// ── Exportaciones del catálogo ─────────────────────────────────────

export const MODULOS: Record<string, string> = Object.fromEntries(
  Object.entries(cfg.modulos).map(([k, v]: any) => [k, v.nombre])
);

export const AGENCIAS: Record<string, string> = Object.fromEntries(
  Object.entries(cfg.agencias).map(([k, v]: any) => [k, v.nombre])
);

export const ANIOS_RANGO = cfg.anios_rango as { inicio: number; fin: number };

// Mapa lowercase → canónico para resolución case-insensitive del módulo
const MODULO_CANONICO = new Map<string, string>(
  Object.keys(cfg.modulos).map((k: string) => [k.toLowerCase(), k])
);

// ── Listas de control ──────────────────────────────────────────────

const IGNORAR_PREFIJOS: string[]  = (cfg.ignorar?.prefijos ?? []).map((s: string) => s.toLowerCase());
const IGNORAR_EXACTOS: Set<string> = new Set(
  (cfg.ignorar?.exactos ?? []).map((s: string) => s.toLowerCase())
);
const CATALOGO_PREFIJOS: string[] = (cfg.catalogos?.prefijos ?? []).map((s: string) => s.toLowerCase());

// ── Tipos ──────────────────────────────────────────────────────────

export type TipoDB = 'modular' | 'catalogo';

export interface DBInfo {
  nombre:        string;
  tipo:          TipoDB;
  modulo:        string;         // '' para catálogos
  moduloNombre:  string;
  financiero:    boolean;
  prioridad:     number;
  agencia:       string;         // '' para catálogos
  agenciaNombre: string;
  anio:          number;         // 0 para catálogos
}

// ── Parser principal ───────────────────────────────────────────────

/**
 * Parsea el nombre de una BD según la convención {Modulo}{Agencia}{Año}.
 *
 * - Devuelve null   → BD ignorada (Erk*, BDOPCI, system DBs, etc.)
 * - tipo 'catalogo' → BD compartida sin agencia/año (Admin, Clieprov*, etc.)
 * - tipo 'modular'  → BD normal del ERP, solo años dentro de anios_rango
 *
 * El módulo se resuelve case-insensitively al nombre canónico del JSON.
 */
export function parsearNombreDB(nombre: string): DBInfo | null {
  const lower = nombre.toLowerCase();

  // 1. Lista de ignorados exactos y por prefijo
  if (IGNORAR_EXACTOS.has(lower)) return null;
  if (IGNORAR_PREFIJOS.some(p => lower.startsWith(p))) return null;

  // 2. Catálogos compartidos (sin agencia ni año)
  if (CATALOGO_PREFIJOS.some(p => lower.startsWith(p))) {
    return {
      nombre,
      tipo:          'catalogo',
      modulo:        '',
      moduloNombre:  'Catálogo compartido',
      financiero:    false,
      prioridad:     99,
      agencia:       '',
      agenciaNombre: '',
      anio:          0,
    };
  }

  // 3. Patrón {Modulo}{Agencia}{Año} — busca agencia conocida dentro del nombre
  for (const agencia of Object.keys(AGENCIAS)) {
    const idx = nombre.indexOf(agencia);
    if (idx < 1) continue;                       // agencia no encontrada o al inicio

    const moduloRaw = nombre.substring(0, idx);
    const resto     = nombre.substring(idx + agencia.length);
    const anio      = parseInt(resto, 10);

    if (!moduloRaw || isNaN(anio)) continue;

    // Solo años activos según anios_rango
    if (anio < ANIOS_RANGO.inicio || anio > ANIOS_RANGO.fin) continue;

    // Normalizar módulo a forma canónica (case-insensitive)
    const moduloCanon = MODULO_CANONICO.get(moduloRaw.toLowerCase());
    if (!moduloCanon) continue;                  // prefijo de módulo desconocido

    const modCfg = cfg.modulos[moduloCanon] as {
      nombre: string;
      financiero: boolean;
      prioridad: number;
    };

    return {
      nombre,
      tipo:          'modular',
      modulo:        moduloCanon,
      moduloNombre:  modCfg.nombre,
      financiero:    modCfg.financiero,
      prioridad:     modCfg.prioridad,
      agencia,
      agenciaNombre: AGENCIAS[agencia] ?? agencia,
      anio,
    };
  }

  return null;
}

// ── Utilidades de construcción de nombres ──────────────────────────

/** Construye el nombre canónico de una BD: 'Conta' + 'CAMA' + 2025 → 'ContaCAMA2025' */
export function buildNombreDB(modulo: string, agencia: string, anio: number): string {
  return `${modulo}${agencia}${anio}`;
}

/** Nombres posibles para un módulo/agencia en un rango de años explícito */
export function nombresDBRango(
  modulo:  string,
  agencia: string,
  inicio:  number,
  fin:     number,
): string[] {
  const nombres: string[] = [];
  for (let anio = inicio; anio <= fin; anio++) {
    nombres.push(buildNombreDB(modulo, agencia, anio));
  }
  return nombres;
}
