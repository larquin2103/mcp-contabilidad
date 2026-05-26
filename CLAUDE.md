# CLAUDE.md — Contexto del proyecto mcp-contabilidad

## ¿Qué es este proyecto?

Servidor MCP de **solo lectura** que actúa como CFO virtual sobre el ERP de contabilidad
estatal cubana que implementa la **Resolución 235/2005** del Ministerio de Finanzas y
Precios (MFP). Proporciona tools de análisis financiero y un prompt de sistema que
convierte a Claude en director financiero con semáforos y recomendaciones.

No hay backend propio, no hay API REST, no hay base de datos local.
Todo el dato viene de SQL Server 2000 a través del pool de conexiones en `src/db.ts`.

---

## Sistema contable cubano (Resolución 235)

### Marco normativo

El ERP implementa las **Normas Cubanas de Información Financiera Empresarial (NCFE)**
bajo la Resolución 235/2005 del MFP. Es un plan de cuentas de partida doble donde
cada asiento debe cuadrar: `ΣDébito = ΣCrédito`. El invariante es absoluto — si no
cuadra, hay un error de captura o de cierre.

### Plan de Cuentas cubano — estructura por dígitos

El código de cuenta tiene 3–4 dígitos. El primer dígito determina el grupo:

| Dígito | Grupo                     | Naturaleza | Ejemplos típicos                        |
|--------|---------------------------|------------|-----------------------------------------|
| 1      | Activo Circulante         | Deudora (D)| 101 Caja, 102 Banco, 135 Cuentas×Cobrar |
| 2      | Activo No Circulante      | Deudora (D)| 215 Activos Fijos, 226 Amortización     |
| 3      | Inventarios               | Deudora (D)| 311 Materias Primas, 381 Mercancías     |
| 4      | Pasivo Circulante         | Acreedora (A)| 410 Préstamos C/P, 420 Cuentas×Pagar  |
| 5      | Patrimonio                | Acreedora (A)| 510 Capital, 525 Reservas, 530 Utilidades|
| 6      | Costos y Gastos           | Deudora (D)| 600 Costo de Ventas, 604 Distribución  |
| 7      | Ingresos                  | Acreedora (A)| 703 Ventas, 720 Otros Ingresos        |
| 8      | Cuentas de Orden          | Mixta      | Control extracontable                   |
| 9      | Analíticas / Contratas    | Mixta      | Cuentas de cierre y ajuste             |

**Naturaleza**: `D` = saldo normal deudor (aumenta con Débito), `A` = saldo normal
acreedor (aumenta con Crédito). Este campo está en `[Clasificador de Cuentas_1]`.

### Par 604 / 135 — lógica clave de ventas a crédito

El par **604/135** es el patrón doble que produce una venta de servicios/mercancías
a crédito en el sistema cubano. Involucra dos asientos simultáneos:

```
Asiento 1 — reconocer la venta (ingreso):
  Dr  135  Efectos y Cuentas a Cobrar       +importe
  Cr  703  Ventas / Ingresos por Servicios  -importe

Asiento 2 — reconocer el costo (principio de correlación):
  Dr  604  Costos de Distribución y Ventas  +costo
  Cr  381  Mercancías / 311 Materias Primas -costo
```

**Por qué el par importa para el análisis:**

- El ratio `604 / 703` es el costo sobre venta. Si se aleja del histórico,
  hay cambio de margen o error de registro.
- Cuenta **135** (deudora) acumula las ventas no cobradas. Su saldo final
  debería validar contra la cartera de cobros (módulo CxC cuando exista).
- Cuenta **604** (deudora) acumula el costo total del período. Dividida entre
  `703` da el margen bruto comparable con el benchmark del sector.
- Si `135` crece más rápido que `703`, los días de cobro están aumentando
  (señal de alerta en el CFO prompt 🟡/🔴).

**Verificación de cuadre en el análisis**: `balance_saldos` comprueba que
`|ΣDébito total − ΣCrédito total| < 0.01`. Si falla, no interpretar resultados
hasta resolver el descuadre con el equipo contable.

---

## Conexión SQL Server 2000

### Driver y connection string

```typescript
// src/db.ts — patrón exacto que funciona en producción
import sql from 'mssql/msnodesqlv8.js';

const config: any = {
  driver: 'msnodesqlv8',
  connectionString:
    'Driver={SQL Server Native Client 10.0};' +
    'Server=192.168.7.70;Database=' + database + ';UID=sa;PWD=swift;',
  connectionTimeout: 15000,
  requestTimeout:    30000,
  pool: { max: 10, min: 0, idleTimeoutMillis: 30000 },
};
const pool = await new sql.ConnectionPool(config).connect();
```

**Por qué `any`**: `sql.config` del paquete `@types/mssql` no declara `connectionString`
(es una propiedad del driver ODBC, no del cliente TCP estándar). Tiparlo como `any`
evita TS2353 sin perder funcionalidad.

### Restricciones SQL Server 2000

No existen las vistas `sys.*` (añadidas en SQL Server 2005). Usar siempre:

| Necesidad               | SQL Server 2000 (correcto)                              | ❌ NO usar          |
|-------------------------|---------------------------------------------------------|---------------------|
| Listar BDs              | `master..sysdatabases`                                  | `sys.databases`     |
| Listar tablas           | `sysobjects WHERE xtype='U'`                            | `sys.tables`        |
| Listar columnas         | `syscolumns` o `INFORMATION_SCHEMA.COLUMNS`             | `sys.columns`       |
| Claves foráneas         | `sysforeignkeys` + `syscolumns`                         | `sys.foreign_keys`  |
| Contar filas            | `sysindexes WHERE indid <= 1`                           | `sys.partitions`    |
| CTEs (`WITH ... AS`)    | **No soportadas** — usar vistas derivadas (subqueries)  | `WITH cte AS (...)`  |

`INFORMATION_SCHEMA` sí funciona en SS2000 (para columnas y constraints).

### Variables de entorno (config/.env)

```
DB_SERVER=192.168.7.70
DB_USER=sa
DB_PASSWORD=swift
```

La BD se especifica en el connection string de cada pool, no como variable.
El usuario `sa` tiene acceso completo pero el MCP nunca emite escrituras.

---

## Tablas núcleo del módulo Conta

Presentes en cada `Conta{Agencia}{Año}` (ej: `ContaCAMA2025`).

### Mayor — libro mayor

Fuente principal de saldos. Una fila por (Cuenta, SubCuenta, Período).

| Columna              | Tipo    | Notas                                      |
|----------------------|---------|--------------------------------------------|
| `Cuenta`             | varchar | Código 3–4 dígitos. Ej: `'135'`, `'604'`  |
| `SubCuenta`          | varchar | `'00'` = cuenta principal, otros = detalle |
| `Período`            | int     | 0 = apertura, 1–12 = enero–diciembre       |
| `[Débito]`           | decimal | Movimiento del período                     |
| `[Crédito]`          | decimal | Movimiento del período                     |
| `[Débito Acumulado]` | decimal | Acumulado desde período 0 hasta este       |
| `[Crédito Acumulado]`| decimal | Acumulado desde período 0 hasta este       |

**Regla de saldo**: `Saldo = Débito − Crédito`. Para cuentas acreedoras (4xx, 5xx, 7xx)
el saldo "normal" es negativo en esta fórmula — el Clasificador da la Naturaleza para
interpretar correctamente.

### Clasificador de Cuentas_1 — catálogo de cuentas

1 011 filas. Una fila por (Cuenta, SubCuenta). JOIN con Mayor por ambas columnas.

| Columna         | Tipo    | Notas                                         |
|-----------------|---------|-----------------------------------------------|
| `Cuenta`        | varchar | Mismo código que en Mayor                     |
| `SubCuenta`     | varchar | Mismo código que en Mayor                     |
| `[Descripción]` | varchar | Nombre de la cuenta o subcuenta               |
| `Naturaleza`    | char(1) | `'D'` = deudora, `'A'` = acreedora           |
| `[Grupo Clase]` | varchar | Agrupación de clase (ej: `'Activo Circulante'`)|
| `Terminal`      | bit/char| Indica si es cuenta de detalle (hoja del árbol)|

**JOIN siempre por Cuenta + SubCuenta**. No existe un campo ID sintético.

### Asiento — detalle de asientos contables

10 046 registros. Detalle diario de cada movimiento.

| Columna                    | Tipo    | Notas                                   |
|----------------------------|---------|-----------------------------------------|
| `Cuenta`                   | varchar | Código de cuenta                        |
| `SubCuenta`                | varchar | Código de subcuenta                     |
| `Período`                  | int     | 0–12                                    |
| `[Débito]`                 | decimal | Importe deudor del asiento              |
| `[Crédito]`                | decimal | Importe acreedor del asiento            |
| `Naturaleza`               | char(1) | `'D'` o `'H'` (Haber) — en Asiento usa H|
| `Fecha`                    | datetime| Fecha del asiento                       |
| `Detalle`                  | varchar | Descripción del asiento                 |
| `[Documento de Obligación]`| varchar | Referencia del documento fuente         |
| `[Tipo de Comprobante]`    | varchar | Clase de comprobante contable           |

### Tablas que NO se deben usar

- `PlanCuentas` — vacía, sin datos
- `Balance de Comprobación` — vacía, sin datos

### Regla de nombres con espacios y acentos

**Siempre corchetes** en nombres de tabla y columna que contengan espacios o caracteres
especiales:

```sql
-- Correcto
SELECT cc.[Descripción], m.[Débito Acumulado]
FROM [Clasificador de Cuentas_1] cc
JOIN [Mayor] m ON cc.Cuenta = m.Cuenta AND cc.SubCuenta = m.SubCuenta

-- Incorrecto — falla en SS2000
SELECT cc.Descripción, m.Débito Acumulado ...
```

---

## Convención de nombres de BD

```
{Módulo}{Agencia}{Año}    →    ContaCAMA2025
```

### Módulos (Resolución 235)

| Código  | Nombre               | Financiero | Prioridad |
|---------|----------------------|------------|-----------|
| `Conta` | Contabilidad         | sí         | 1         |
| `Fact`  | Facturación          | sí         | 2         |
| `MB`    | Medios Básicos       | sí         | 3         |
| `Inve`  | Inventario           | sí         | 4         |
| `Costo` | Costos               | sí         | 5         |
| `Nom`   | Nómina               | sí         | 6         |
| `Fin`   | Finanzas             | sí         | 7         |
| `Audt`  | Auditoría            | no         | 8         |
| `Util`  | Útiles del sistema   | no         | 9         |

El parser de nombres es **case-insensitive**: `conta`, `Conta`, `CONTA` → `Conta`.

### Agencias

| Código | Nombre    |
|--------|-----------|
| `CAMA` | Camaguey  |
| `ANAV` | ANAV      |
| `DIR`  | Dirección |
| `UBL`  | UBL       |
| `UDCT` | UDCT      |
| `FEF`  | FEF       |

### BDs ignoradas por el parser

- Prefijo `Erk*` → ignorar
- Exactos: `BDOPCI`, `BDOPCIOLD`, `Certificados`, `Northwind`, `pubs`
- Sistemas: `master`, `tempdb`, `model`, `msdb`

### Catálogos compartidos (sin agencia ni año)

`Admin`, `Clieprov*`, `Codif*`, `RRHH*` → `parsearNombreDB` devuelve `tipo:'catalogo'`
en lugar de `null`. Aparecen en `listar_bases_datos` sin agencia ni año.

### Años activos

Solo **2025 y 2026**. El parser rechaza cualquier otro año.
Fuente de verdad: `config/agencias.json` → `anios_rango`.

---

## Archivos clave — leer en este orden

```
src/index.ts                ← Entry point: registra tools y prompt MCP
src/db.ts                   ← Pool de conexiones msnodesqlv8 (solo lectura)
src/registry.ts             ← Parser de nombres de BD y catálogo módulos/agencias
config/agencias.json        ← Fuente de verdad: módulos, agencias, años activos
src/engine/calculadora.ts   ← KPIs financieros (puras, sin I/O)
src/engine/modelador.ts     ← Escenarios financieros (puras, sin I/O)
src/prompts/cfo-system.ts   ← System prompt del CFO virtual + benchmarks
src/tools/contabilidad.ts   ← 4 tools MCP del Mayor/Clasificador/Asiento
src/tools/indicadores.ts    ← 6 tools MCP de KPIs
src/tools/escenarios.ts     ← 5 tools MCP de escenarios
src/tools/discovery.ts      ← 3 tools MCP de exploración de BD
src/tools/multidb.ts        ← 3 tools MCP de consultas SQL libres
```

---

## Arquitectura

```
Claude (cliente MCP)
       │
       ▼
src/index.ts  ←── registra tools y prompt (loop genérico, sin cases manuales)
       │
       ├── tools/contabilidad.ts → getPool() → Mayor / Clasificador / Asiento
       ├── tools/discovery.ts    → getPool() → sysobjects, sysdatabases
       ├── tools/multidb.ts      → getPool() → SQL libre validado
       ├── tools/indicadores.ts  → engine/calculadora.ts  (sin DB)
       ├── tools/escenarios.ts   → engine/modelador.ts    (sin DB)
       └── prompts/cfo-system.ts                          (texto puro)
```

Los engines (`calculadora.ts`, `modelador.ts`) son **funciones puras** sin I/O.
Las tools de KPIs y escenarios reciben datos numéricos ya extraídos de la BD.

---

## Flujo típico de análisis contable

```
1. listar_bases_datos          → identifica ContaCAMA2025, ContaANAV2025, etc.
2. balance_saldos(base_datos)  → saldos globales + verificación de cuadre
3. estado_situacion(base_datos)→ balance general por grupos 1-7
4. saldo_cuenta(base_datos, '604') + saldo_cuenta(base_datos, '135')
                               → verificar par 604/135, calcular margen
5. comparar_periodos(base_datos, 0, 6)
                               → evolución apertura → junio
6. kpi_completo(...)           → calcular KPIs con los valores extraídos
7. escenario_*(...)            → modelar hipótesis
```

Para comparar entre agencias o años: llamar las tools contables dos veces con
`base_datos` diferentes (`ContaCAMA2025` vs `ContaANAV2025`, o 2025 vs 2026).

---

## Comandos de desarrollo

```bash
npm install --ignore-scripts   # instalar sin compilar msnodesqlv8 nativo
npm run dev                    # ejecutar con tsx (sin compilar)
npm run build                  # compilar TypeScript → dist/
npm run lint                   # type-check sin emitir (tsc --noEmit)
npm start                      # ejecutar compilado
```

> `npm install` falla en Linux sin ODBC/Native Client instalado (msnodesqlv8
> es un addon nativo). Usar `--ignore-scripts` para obtener solo los tipos.
> En Windows con SQL Server Native Client 10.0 instalado, `npm install` completo.

Type-check filtrado (evita ruido de node_modules faltantes):

```bash
npx tsc --noEmit 2>&1 | grep "^src/"
```

---

## Añadir una nueva tool

1. Agregar la definición al array `*Tools` en el archivo de tools correspondiente
2. Agregar el case en la función `ejecutar*`
3. Si necesita lógica de cálculo, añadirla en el engine correspondiente
4. El loop genérico en `index.ts` la registra automáticamente — no tocar index.ts

## Añadir un nuevo escenario financiero

1. Definir `interface Params*` en `src/engine/modelador.ts`
2. Implementar `modelar*(): ResultadoEscenario`
3. Exportar desde `modelador.ts`
4. Añadir la tool en `src/tools/escenarios.ts` (definición + case en handler)

## Añadir un nuevo grupo de KPIs

1. Añadir `interface Datos*` y `interface KPI*` en `src/engine/calculadora.ts`
2. Implementar `calcular*()` usando el helper `item()`
3. Exportar desde `calculadora.ts`
4. Añadir tool en `src/tools/indicadores.ts`

---

## Seguridad — restricciones de solo lectura

- `src/tools/multidb.ts`: `validarSQL()` bloquea INSERT / UPDATE / DELETE / DROP /
  TRUNCATE / ALTER / CREATE / EXEC / XP_ / SP_ / OPENROWSET
- Solo se aceptan sentencias `SELECT` o CTEs (`WITH ... SELECT`)
- Las tools contables (`contabilidad.ts`) solo usan queries fijas — sin SQL de usuario
- Nunca añadir escrituras; si alguien lo pide, rechazarlo

---

## Registro MCP en Claude Code

```json
{
  "mcpServers": {
    "contabilidad": {
      "command": "node",
      "args": ["<ruta>/dist/index.js"]
    }
  }
}
```

En desarrollo con tsx:

```json
{
  "mcpServers": {
    "contabilidad": {
      "command": "npx",
      "args": ["tsx", "<ruta>/src/index.ts"]
    }
  }
}
```

---

## Estado actual del proyecto

| Archivo                       | Estado      | Notas                                 |
|-------------------------------|-------------|---------------------------------------|
| `src/db.ts`                   | ✅ completo | msnodesqlv8, config:any, pool por BD  |
| `src/registry.ts`             | ✅ completo | case-insensitive, catálogos, años 25-26|
| `config/agencias.json`        | ✅ completo | 9 módulos + 6 agencias + ignorar list |
| `src/engine/calculadora.ts`   | ✅ completo | KPIs puros, semáforos                 |
| `src/engine/modelador.ts`     | ✅ completo | 5 escenarios financieros              |
| `src/prompts/cfo-system.ts`   | ✅ completo | CFO virtual + benchmarks sector       |
| `src/tools/contabilidad.ts`   | ✅ completo | balance_saldos, saldo_cuenta,         |
|                               |             | estado_situacion, comparar_periodos   |
| `src/tools/indicadores.ts`    | ✅ completo | 6 tools KPI                           |
| `src/tools/escenarios.ts`     | ✅ completo | 5 tools escenarios                    |
| `src/tools/discovery.ts`      | ✅ completo | SS2000: sysobjects, sysindexes        |
| `src/tools/multidb.ts`        | ✅ completo | consultar_db, multianio, comparar     |
| `src/index.ts`                | ✅ completo | loop genérico, prompt CFO             |
