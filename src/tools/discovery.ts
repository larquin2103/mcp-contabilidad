import { readFileSync }    from 'fs';
import { join, dirname }   from 'path';
import { fileURLToPath }   from 'url';
import { getPool, resolverClaveServidor } from '../db.js';
import { parsearNombreDB } from '../registry.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const _agenciasCfg = JSON.parse(
  readFileSync(join(__dirname, '../../config/agencias.json'), 'utf-8')
);
// Claves de servidor únicas definidas en agencias.json
const CLAVES_SERVIDOR: string[] = Object.keys(_agenciasCfg.servidores ?? { principal: {} });

export const discoveryTools = [
  {
    name: 'listar_bases_datos',
    description: `Lista todas las BDs del servidor agrupadas por módulo y agencia.
Usar siempre como primer paso antes de cualquier consulta.
Ejemplo: listar todas las BDs de Facturación de CAMA.`,
    inputSchema: {
      type: 'object',
      properties: {
        filtro_modulo:  { type: 'string', description: 'Ej: Fact, Conta, Inv' },
        filtro_agencia: { type: 'string', description: 'Ej: CAMA, ANAV' },
        filtro_anio:    { type: 'number', description: 'Ej: 2025' },
      },
    },
  },
  {
    name: 'explorar_esquema_db',
    description: `Explora la estructura de una BD: tablas, columnas, relaciones y datos de muestra.
Necesario para entender el modelo antes de construir consultas.`,
    inputSchema: {
      type: 'object',
      properties: {
        base_datos: { type: 'string', description: 'Ej: FactCAMA2025' },
        tabla:      { type: 'string', description: 'Si se omite, lista todas las tablas' },
      },
      required: ['base_datos'],
    },
  },
  {
    name: 'explorar_relaciones',
    description: 'Devuelve el mapa completo de relaciones (claves foráneas) de una BD.',
    inputSchema: {
      type: 'object',
      properties: {
        base_datos: { type: 'string', description: 'Ej: FactCAMA2025' },
      },
      required: ['base_datos'],
    },
  },
];

export async function ejecutarDiscovery(name: string, args: any): Promise<string> {

  // ── listar_bases_datos ──────────────────────────────────────────
  // Conecta a master y consulta sysdatabases (SQL Server 2000).
  if (name === 'listar_bases_datos') {
    // Consulta todos los servidores configurados en paralelo
    const resultados = await Promise.allSettled(
      CLAVES_SERVIDOR.map(async (clave) => {
        const master = await getPool('master', clave);
        const res = await master.request().query(`
          SELECT name FROM master..sysdatabases
          WHERE name NOT IN ('master','tempdb','model','msdb')
          ORDER BY name
        `);
        return { clave, dbs: res.recordset as { name: string }[] };
      })
    );

    const todasLasBDs: string[] = [];
    const erroresServidor: Record<string, string> = {};
    for (let i = 0; i < resultados.length; i++) {
      const r = resultados[i];
      const clave = CLAVES_SERVIDOR[i];
      if (r.status === 'fulfilled') {
        // Solo incluir BDs cuya agencia pertenece a este servidor (evita duplicados
        // cuando el servidor FEF replica bases de otros servidores como CAMA o AG).
        const propias = r.value.dbs
          .filter(x => resolverClaveServidor(x.name) === clave)
          .map(x => x.name);
        todasLasBDs.push(...propias);
      } else {
        erroresServidor[clave] = String(r.reason);
      }
    }

    let dbs = todasLasBDs
      .map(name => parsearNombreDB(name))
      .filter(info => info !== null)
      .map(info => info!);

    if (args.filtro_modulo)  dbs = dbs.filter((d: any) => d.modulo  === args.filtro_modulo);
    if (args.filtro_agencia) dbs = dbs.filter((d: any) => d.agencia === args.filtro_agencia);
    if (args.filtro_anio)    dbs = dbs.filter((d: any) => d.anio    === args.filtro_anio);

    const agrupado: Record<string, Record<string, number[]>> = {};
    for (const db of dbs) {
      if (!agrupado[db.moduloNombre]) agrupado[db.moduloNombre] = {};
      if (!agrupado[db.moduloNombre][db.agenciaNombre]) agrupado[db.moduloNombre][db.agenciaNombre] = [];
      agrupado[db.moduloNombre][db.agenciaNombre].push(db.anio);
    }

    const resp: any = { total: dbs.length, estructura: agrupado, detalle: dbs };
    if (Object.keys(erroresServidor).length > 0) resp.errores_servidor = erroresServidor;
    return JSON.stringify(resp, null, 2);
  }

  // ── explorar_esquema_db ─────────────────────────────────────────
  if (name === 'explorar_esquema_db') {
    const { base_datos, tabla } = args;
    const dbPool = await getPool(base_datos);

    if (tabla) {
      // Columnas + PK + FK via INFORMATION_SCHEMA (soportado en SS2000)
      const cols = await dbPool.request()
        .input('tabla', tabla)
        .query(`
          SELECT
            c.COLUMN_NAME,
            c.DATA_TYPE,
            c.CHARACTER_MAXIMUM_LENGTH,
            c.NUMERIC_PRECISION,
            c.IS_NULLABLE,
            c.COLUMN_DEFAULT,
            CASE WHEN pk.COLUMN_NAME IS NOT NULL THEN 'PK' ELSE '' END AS Es_PK,
            ISNULL(fk.TablaRef, '')                                     AS FK_Tabla
          FROM INFORMATION_SCHEMA.COLUMNS c
          LEFT JOIN (
            SELECT ku.TABLE_NAME, ku.COLUMN_NAME
            FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
            JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE ku
              ON tc.CONSTRAINT_NAME = ku.CONSTRAINT_NAME
            WHERE tc.CONSTRAINT_TYPE = 'PRIMARY KEY'
          ) pk ON pk.TABLE_NAME = c.TABLE_NAME AND pk.COLUMN_NAME = c.COLUMN_NAME
          LEFT JOIN (
            SELECT ku.TABLE_NAME, ku.COLUMN_NAME, ccu.TABLE_NAME AS TablaRef
            FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS rc
            JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE ku
              ON rc.CONSTRAINT_NAME = ku.CONSTRAINT_NAME
            JOIN INFORMATION_SCHEMA.CONSTRAINT_COLUMN_USAGE ccu
              ON rc.UNIQUE_CONSTRAINT_NAME = ccu.CONSTRAINT_NAME
          ) fk ON fk.TABLE_NAME = c.TABLE_NAME AND fk.COLUMN_NAME = c.COLUMN_NAME
          WHERE c.TABLE_NAME = @tabla
          ORDER BY c.ORDINAL_POSITION
        `);

      const tablaValida = tabla.replace(/[^a-zA-Z0-9_]/g, '');
      const muestra = await dbPool.request()
        .query(`SELECT TOP 3 * FROM [${tablaValida}]`);

      return JSON.stringify({
        base_datos, tabla,
        columnas: cols.recordset,
        muestra:  muestra.recordset,
      }, null, 2);
    }

    // Todas las tablas con conteo de filas via sysobjects + sysindexes (SS2000)
    const tablas = await dbPool.request().query(`
      SELECT
        o.name                  AS TABLE_NAME,
        ISNULL(i.rows, 0)       AS NumRegistros
      FROM sysobjects o
      LEFT JOIN sysindexes i ON i.id = o.id AND i.indid <= 1
      WHERE o.xtype = 'U'
      ORDER BY ISNULL(i.rows, 0) DESC
    `);

    return JSON.stringify({ base_datos, tablas: tablas.recordset }, null, 2);
  }

  // ── explorar_relaciones ─────────────────────────────────────────
  // Usa sysforeignkeys + syscolumns (SS2000). No existe sys.foreign_keys.
  if (name === 'explorar_relaciones') {
    const dbPool = await getPool(args.base_datos);
    const result = await dbPool.request().query(`
      SELECT
        OBJECT_NAME(sfk.constid)  AS Relacion,
        OBJECT_NAME(sfk.fkeyid)   AS TablaOrigen,
        sc1.name                  AS ColumnaOrigen,
        OBJECT_NAME(sfk.rkeyid)   AS TablaDestino,
        sc2.name                  AS ColumnaDestino
      FROM sysforeignkeys sfk
      JOIN syscolumns sc1 ON sc1.id = sfk.fkeyid AND sc1.colid = sfk.fkey
      JOIN syscolumns sc2 ON sc2.id = sfk.rkeyid AND sc2.colid = sfk.rkey
      ORDER BY TablaOrigen, TablaDestino
    `);
    return JSON.stringify({ base_datos: args.base_datos, relaciones: result.recordset }, null, 2);
  }

  throw new Error(`Tool desconocida: ${name}`);
}
