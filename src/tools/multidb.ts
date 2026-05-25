import { getPool, dbExiste }          from '../db.js';
import { parsearNombreDB, buildNombreDB } from '../registry.js';

// ── Lista de operaciones bloqueadas ───────────────────────────────
const BLOQUEADAS = ['INSERT','UPDATE','DELETE','DROP','TRUNCATE','ALTER',
                    'CREATE','EXEC','EXECUTE','XP_','SP_','OPENROWSET'];

function validarSQL(sql: string): void {
  const upper = sql.trim().toUpperCase();
  if (!upper.startsWith('SELECT') && !upper.startsWith('WITH')) {
    throw new Error('Solo se permiten consultas SELECT o CTEs (WITH ... SELECT)');
  }
  for (const kw of BLOQUEADAS) {
    if (upper.includes(kw)) throw new Error(`Operación no permitida: ${kw}`);
  }
}

export const multidbTools = [
  {
    name: 'consultar_db',
    description: `Ejecuta una consulta SELECT de solo lectura en una BD específica.
Claude construye la query tras explorar el esquema con explorar_esquema_db.`,
    inputSchema: {
      type: 'object',
      properties: {
        base_datos:  { type: 'string', description: 'Ej: FactCAMA2025' },
        sql:         { type: 'string', description: 'Sentencia SELECT' },
        descripcion: { type: 'string', description: 'Qué analiza esta consulta' },
      },
      required: ['base_datos', 'sql', 'descripcion'],
    },
  },
  {
    name: 'consultar_multianio',
    description: `Ejecuta la misma consulta en el mismo módulo/agencia a lo largo de varios años.
Ideal para análisis de tendencias. Usar {{DB}} como placeholder del nombre de BD.
Ejemplo: SELECT SUM(Total) FROM {{DB}}.dbo.Facturas`,
    inputSchema: {
      type: 'object',
      properties: {
        modulo:       { type: 'string', description: 'Ej: Fact, Conta' },
        agencia:      { type: 'string', description: 'Ej: CAMA, ANAV' },
        anio_inicio:  { type: 'number', description: 'Ej: 2022' },
        anio_fin:     { type: 'number', description: 'Ej: 2025' },
        sql_template: {
          type: 'string',
          description: 'Query con {{DB}} como placeholder del nombre de la BD',
        },
        descripcion: { type: 'string' },
      },
      required: ['modulo', 'agencia', 'anio_inicio', 'anio_fin', 'sql_template'],
    },
  },
  {
    name: 'comparar_agencias',
    description: `Compara el mismo indicador entre CAMA, ANAV y otras agencias para un módulo y año.
Usar {{DB}} como placeholder. Descubre automáticamente qué agencias tienen esa BD.`,
    inputSchema: {
      type: 'object',
      properties: {
        modulo:       { type: 'string', description: 'Ej: Fact' },
        anio:         { type: 'number', description: 'Ej: 2025' },
        sql_template: { type: 'string', description: 'Query con {{DB}} como placeholder' },
        descripcion:  { type: 'string' },
      },
      required: ['modulo', 'anio', 'sql_template'],
    },
  },
];

export async function ejecutarMultidb(name: string, args: any): Promise<string> {

  // ── consultar_db ────────────────────────────────────────────────
  if (name === 'consultar_db') {
    const { base_datos, sql, descripcion } = args;
    validarSQL(sql);

    const pool   = await getPool(base_datos);
    const result = await pool.request().query(sql);

    return JSON.stringify({
      base_datos, descripcion,
      total_filas: result.recordset.length,
      datos:       result.recordset,
    }, null, 2);
  }

  // ── consultar_multianio ─────────────────────────────────────────
  if (name === 'consultar_multianio') {
    const { modulo, agencia, anio_inicio, anio_fin, sql_template, descripcion } = args;
    validarSQL(sql_template.replace(/\{\{DB\}\}/g, 'X'));

    const resultados: any[] = [];

    for (let anio = anio_inicio; anio <= anio_fin; anio++) {
      const nombreDB = buildNombreDB(modulo, agencia, anio);
      const sql      = sql_template.replace(/\{\{DB\}\}/g, nombreDB);

      if (!(await dbExiste(nombreDB))) {
        resultados.push({ anio, base_datos: nombreDB, disponible: false });
        continue;
      }

      try {
        const pool   = await getPool(nombreDB);
        const result = await pool.request().query(sql);
        resultados.push({ anio, base_datos: nombreDB, disponible: true, datos: result.recordset });
      } catch (err: any) {
        resultados.push({ anio, base_datos: nombreDB, disponible: false, error: err.message });
      }
    }

    return JSON.stringify({
      modulo, agencia,
      rango: `${anio_inicio}–${anio_fin}`,
      descripcion,
      resultados,
    }, null, 2);
  }

  // ── comparar_agencias ───────────────────────────────────────────
  if (name === 'comparar_agencias') {
    const { modulo, anio, sql_template, descripcion } = args;
    validarSQL(sql_template.replace(/\{\{DB\}\}/g, 'X'));

    // Descubrir qué agencias tienen este módulo/año en el servidor
    const masterPool = await getPool();
    const dbs = await masterPool.request().query(`
      SELECT name FROM sys.databases
      WHERE name LIKE '${modulo}%${anio}'
        AND state_desc = 'ONLINE'
    `);

    const resultados: any[] = [];

    for (const { name: dbName } of dbs.recordset) {
      const info = parsearNombreDB(dbName);
      if (!info) continue;

      const sql = sql_template.replace(/\{\{DB\}\}/g, dbName);
      try {
        const pool   = await getPool(dbName);
        const result = await pool.request().query(sql);
        resultados.push({
          agencia:      info.agencia,
          agenciaNombre: info.agenciaNombre,
          base_datos:   dbName,
          datos:        result.recordset,
        });
      } catch (err: any) {
        resultados.push({ agencia: info.agencia, base_datos: dbName, error: err.message });
      }
    }

    return JSON.stringify({ modulo, anio, descripcion, comparativa: resultados }, null, 2);
  }

  throw new Error(`Tool desconocida: ${name}`);
}
