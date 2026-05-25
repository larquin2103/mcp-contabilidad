# CLAUDE.md — Contexto del proyecto mcp-contabilidad

## ¿Qué es este proyecto?

Servidor MCP de **solo lectura** que actúa como CFO virtual sobre un ERP SQL Server.
Proporciona tools de análisis financiero (KPIs, escenarios) y un prompt de sistema
que convierte a Claude en director financiero con semáforos y recomendaciones.

No hay backend propio, no hay API REST, no hay base de datos local.
Todo el dato viene de SQL Server a través del pool de conexiones en `src/db.ts`.

---

## Archivos clave — leer en este orden

```
src/index.ts              ← Entry point: registra tools y prompt MCP
src/db.ts                 ← Pool de conexiones mssql (solo lectura)
src/registry.ts           ← Parser de nombres de BD y catálogo de módulos/agencias
config/agencias.json      ← Fuente de verdad: módulos, agencias, rango de años
src/engine/calculadora.ts ← KPIs financieros (liquidez, rentabilidad, endeudamiento, operacional)
src/engine/modelador.ts   ← Escenarios financieros (5 tipos)
src/prompts/cfo-system.ts ← System prompt del CFO virtual + benchmarks
src/tools/indicadores.ts  ← 6 tools MCP de KPIs
src/tools/escenarios.ts   ← 5 tools MCP de escenarios
src/tools/discovery.ts    ← 3 tools MCP de exploración de BD
src/tools/multidb.ts      ← 3 tools MCP de consultas SQL
```

---

## Arquitectura

```
Claude (cliente MCP)
       │
       ▼
src/index.ts  ←── registra tools y prompt
       │
       ├── tools/discovery.ts   → getPool() → SQL Server
       ├── tools/multidb.ts     → getPool() → SQL Server
       ├── tools/indicadores.ts → engine/calculadora.ts  (sin DB)
       ├── tools/escenarios.ts  → engine/modelador.ts    (sin DB)
       └── prompts/cfo-system.ts                         (texto puro)
```

Los engines (`calculadora.ts`, `modelador.ts`) son **funciones puras** sin I/O.
Las tools de indicadores y escenarios reciben datos numéricos ya extraídos de la BD.

---

## Convención de nombres de BD

```
{Módulo}{Agencia}{Año}
```

| Módulo | Descripción              |
|--------|--------------------------|
| Fact   | Facturación              |
| Conta  | Contabilidad             |
| Inv    | Inventario               |
| Nom    | Nómina                   |
| CxC    | Cuentas por Cobrar       |
| CxP    | Cuentas por Pagar        |
| Tes    | Tesorería                |
| AF     | Activos Fijos            |

| Agencia | Nombre   |
|---------|----------|
| CAMA    | Camaguey |
| ANAV    | ANAV     |

Ejemplos válidos: `FactCAMA2025`, `ContaCAMA2024`, `InvANAV2025`

Para añadir una agencia o módulo: editar `config/agencias.json` únicamente.

---

## Comandos de desarrollo

```bash
npm install           # instalar dependencias
npm run dev           # ejecutar con tsx (sin compilar)
npm run build         # compilar TypeScript → dist/
npm run lint          # type-check sin emitir (tsc --noEmit)
npm start             # ejecutar compilado
```

El type-check (`npm run lint`) mostrará errores en db.ts/registry.ts/index.ts
cuando no hay `node_modules`; eso es normal. Filtrar solo los archivos nuevos:

```bash
npx tsc --noEmit 2>&1 | grep "^src/engine\|^src/tools\|^src/prompts"
```

---

## Flujo típico de análisis (cómo trabajan las tools juntas)

1. `listar_bases_datos` → identifica BDs disponibles para agencia/año
2. `explorar_esquema_db` → entiende las tablas (solo si hay duda sobre el esquema)
3. `consultar_db` o `consultar_multianio` → extrae cifras del balance y P&G
4. `kpi_completo` → calcula todos los KPIs con los valores extraídos
5. `escenario_*` → modela hipótesis sobre esos mismos valores

---

## Añadir una nueva tool

1. Agregar la definición al array `*Tools` en el archivo de tools correspondiente
2. Agregar el case en la función `ejecutar*`
3. Si necesita lógica de cálculo, añadirla en el engine correspondiente
4. No registrar en `index.ts` — el loop genérico lo registra automáticamente

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

- `src/db.ts`: `readOnlyIntent: true` en la config de mssql
- `src/tools/multidb.ts`: `validarSQL()` bloquea INSERT/UPDATE/DELETE/DROP/etc.
- Solo se aceptan sentencias `SELECT` o CTEs (`WITH ... SELECT`)
- Nunca añadir escrituras; si alguien lo pide, rechazarlo

---

## Variables de entorno (config/.env)

```
DB_SERVER=<host_sql_server>
DB_USER=<usuario_readonly>
DB_PASSWORD=<password>
DB_PORT=1433
DB_CONNECT_TIMEOUT=15000
DB_REQUEST_TIMEOUT=30000
```

Plantilla en `config/.env.example`. El usuario debe tener solo `db_datareader`.

---

## Registro MCP en Claude Code

Añadir al `.claude.json` del proyecto o al global `~/.claude.json`:

```json
{
  "mcpServers": {
    "contabilidad": {
      "command": "node",
      "args": ["<ruta-al-proyecto>/dist/index.js"]
    }
  }
}
```

O en desarrollo con `tsx`:

```json
{
  "mcpServers": {
    "contabilidad": {
      "command": "npx",
      "args": ["tsx", "<ruta-al-proyecto>/src/index.ts"]
    }
  }
}
```

---

## Estado actual del proyecto

| Archivo                       | Estado      |
|-------------------------------|-------------|
| `src/db.ts`                   | ✅ completo |
| `src/registry.ts`             | ✅ completo |
| `src/engine/calculadora.ts`   | ✅ completo |
| `src/engine/modelador.ts`     | ✅ completo |
| `src/prompts/cfo-system.ts`   | ✅ completo |
| `src/tools/discovery.ts`      | ✅ completo |
| `src/tools/multidb.ts`        | ✅ completo |
| `src/tools/indicadores.ts`    | ✅ completo |
| `src/tools/escenarios.ts`     | ✅ completo |
| `src/index.ts`                | ✅ completo |
