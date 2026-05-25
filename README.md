# MCP Contabilidad

Servidor MCP de solo lectura para análisis financiero y contable sobre SQL Server.
Actúa como un **CFO virtual** accesible desde Claude Code o claude.ai.

## Estructura de bases de datos

```
{Módulo}{Agencia}{Año}
   │        │      │
   │        │      └── 2022, 2023, 2024, 2025...
   │        └───────── CAMA (Camaguey), ANAV...
   └────────────────── Fact, Conta, Inv, Nom, CxC, CxP...
```

Ejemplos: `FactCAMA2025` · `ContaCAMA2024` · `FactANAV2025`

## Módulos soportados

| Código | Módulo              |
|--------|---------------------|
| Fact   | Facturación         |
| Conta  | Contabilidad        |
| Inv    | Inventario          |
| Nom    | Nómina              |
| CxC    | Cuentas por Cobrar  |
| CxP    | Cuentas por Pagar   |
| Tes    | Tesorería           |
| AF     | Activos Fijos       |

## Agencias

| Código | Nombre    |
|--------|-----------|
| CAMA   | Camaguey  |
| ANAV   | (añadir)  |

## Inicio rápido

```bash
git clone https://github.com/TU_ORG/mcp-contabilidad.git
cd mcp-contabilidad
npm install
cp config/.env.example config/.env
# Editar config/.env con tus credenciales
npm run build
```

## Registrar en Claude Code

Copia el contenido de `config/.claude.json` a tu `.claude.json` de proyecto.

## Seguridad

- Usuario SQL Server con permiso `db_datareader` únicamente
- Solo se permiten sentencias `SELECT` y CTEs con `WITH`
- Palabras clave peligrosas bloqueadas en runtime

## Estructura del proyecto

```
mcp-contabilidad/
├── src/
│   ├── index.ts              # Entry point del servidor MCP
│   ├── db.ts                 # Pool de conexiones multi-BD
│   ├── registry.ts           # Módulos, agencias y parser de nombres
│   ├── prompts/
│   │   └── cfo-system.ts     # System prompt CFO virtual
│   ├── tools/
│   │   ├── discovery.ts      # Exploración del servidor
│   │   ├── multidb.ts        # Consultas multi-BD y multi-año
│   │   ├── indicadores.ts    # KPIs y ratios financieros
│   │   └── escenarios.ts     # Modelación de escenarios
│   └── engine/
│       ├── calculadora.ts    # Motor de KPIs
│       └── modelador.ts      # Motor de escenarios
├── config/
│   ├── .env.example          # Variables de entorno (plantilla)
│   ├── .claude.json          # Registro MCP para Claude Code
│   └── agencias.json         # Catálogo de agencias y módulos
├── docs/
│   ├── naming-convention.md  # Convención de nombres de BDs
│   └── tools-reference.md   # Referencia de todas las tools
├── package.json
├── tsconfig.json
└── .gitignore
```
