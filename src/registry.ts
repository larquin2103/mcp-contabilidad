import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const cfg = JSON.parse(
  readFileSync(join(__dirname, '../config/agencias.json'), 'utf-8')
);

export const MODULOS: Record<string, string> = Object.fromEntries(
  Object.entries(cfg.modulos).map(([k, v]: any) => [k, v.nombre])
);

export const AGENCIAS: Record<string, string> = Object.fromEntries(
  Object.entries(cfg.agencias).map(([k, v]: any) => [k, v.nombre])
);

export const ANIOS_RANGO = cfg.anios_rango as { inicio: number; fin: number };

export interface DBInfo {
  nombre:        string;
  modulo:        string;
  moduloNombre:  string;
  agencia:       string;
  agenciaNombre: string;
  anio:          number;
}

/**
 * Parsea el nombre de una BD según la convención {Modulo}{Agencia}{Año}
 * Ejemplos: FactCAMA2025, ContaCAMA2024, FactANAV2025
 */
export function parsearNombreDB(nombre: string): DBInfo | null {
  // Detecta agencias conocidas dentro del nombre
  const agenciasConocidas = Object.keys(AGENCIAS);

  for (const agencia of agenciasConocidas) {
    const idx = nombre.indexOf(agencia);
    if (idx < 1) continue;

    const modulo = nombre.substring(0, idx);
    const resto  = nombre.substring(idx + agencia.length);
    const anio   = parseInt(resto, 10);

    if (!modulo || isNaN(anio) || anio < 2000 || anio > 2099) continue;

    return {
      nombre,
      modulo,
      moduloNombre:  MODULOS[modulo]  ?? modulo,
      agencia,
      agenciaNombre: AGENCIAS[agencia] ?? agencia,
      anio,
    };
  }
  return null;
}

/**
 * Construye el nombre de una BD a partir de sus partes
 * Ejemplo: buildNombreDB('Fact','CAMA',2025) → 'FactCAMA2025'
 */
export function buildNombreDB(modulo: string, agencia: string, anio: number): string {
  return `${modulo}${agencia}${anio}`;
}

/**
 * Devuelve todos los nombres de BD posibles para un módulo/agencia en un rango de años
 */
export function nombresDBRango(modulo: string, agencia: string, inicio: number, fin: number): string[] {
  const nombres: string[] = [];
  for (let anio = inicio; anio <= fin; anio++) {
    nombres.push(buildNombreDB(modulo, agencia, anio));
  }
  return nombres;
}
