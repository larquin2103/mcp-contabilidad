import { getPool }        from '../db.js';
import { parsearNombreDB } from '../registry.js';

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
  const pool = await getPool();

  // ── listar_bases_datos ──────────────────────────────────────────
  if (name === 'listar_bases_datos') {
    const result = await pool.request().query(`
      SELECT name, create_date, state_desc
      FROM sys.databases
      WHERE name NOT IN ('master','tempdb','model','msdb')
        AND state_desc = 'ONLINE'
      ORDER BY name
    `);

    let dbs = result.recordset
      .map(r => ({ raw: r, info: parsearNombreDB(r.name) }))
      .filter(r => r.info !== null)
      .map(r => r.info!);

    if (args.filtro_modulo)  dbs = dbs.filter(d => d.modulo  === args.filtro_modulo);
    if (args.filtro_agencia) dbs = dbs.filter(d => d.agencia === args.filtro_agencia);
    if (args.filtro_anio)    dbs = dbs.filter(d => d.anio    === args.filtro_anio);

    // Agrupar por módulo → agencia → [años]
    const agrupado: Record<string, Record<string, number[]>> = {};
    for (const db of dbs) {
      if (!agrupado[db.moduloNombre]) agrupado[db.moduloNombre] = {};
      if (!agrupado[db.moduloNombre][db.agenciaNombre]) agrupado[db.moduloNombre][db.agenciaNombre] = [];
      agrupado[db.moduloNombre][db.agenciaNombre].push(db.anio);
    }

    return JSON.stringify({ total: dbs.length, estructura: agrupado, detalle: dbs }, null, 2);
  }

  // ── explorar_esquema_db ─────────────────────────────────────────
  if (name === 'explorar_esquema_db') {
    const { base_datos, tabla } = args;
    const dbPool = await getPool(base_datos);

    if (tabla) {
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

    // Todas las tablas con conteo
    const tablas = await dbPool.request().query(`
      SELECT
        t.TABLE_NAME,
        p.rows AS NumRegistros
      FROM INFORMATION_SCHEMA.TABLES t
      JOIN sys.tables    st ON st.name       = t.TABLE_NAME
      JOIN sys.partitions p  ON p.object_id  = st.object_id
                             AND p.index_id IN (0, 1)
      WHERE t.TABLE_TYPE = 'BASE TABLE'
      ORDER BY p.rows DESC
    `);
    return JSON.stringify({ base_datos, tablas: tablas.recordset }, null, 2);
  }

  // ── explorar_relaciones ─────────────────────────────────────────
  if (name === 'explorar_relaciones') {
    const dbPool = await getPool(args.base_datos);
    const result = await dbPool.request().query(`
      SELECT
        fk.name                                  AS Relacion,
        OBJECT_NAME(fkc.parent_object_id)        AS TablaOrigen,
        COL_NAME(fkc.parent_object_id, fkc.parent_column_id)     AS ColumnaOrigen,
        OBJECT_NAME(fkc.referenced_object_id)    AS TablaDestino,
        COL_NAME(fkc.referenced_object_id, fkc.referenced_column_id) AS ColumnaDestino
      FROM sys.foreign_keys fk
      JOIN sys.foreign_key_columns fkc ON fk.object_id = fkc.constraint_object_id
      ORDER BY TablaOrigen, TablaDestino
    `);
    return JSON.stringify({ base_datos: args.base_datos, relaciones: result.recordset }, null, 2);
  }

  throw new Error(`Tool desconocida: ${name}`);
}
