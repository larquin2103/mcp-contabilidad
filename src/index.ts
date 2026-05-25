import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

import { discoveryTools,   ejecutarDiscovery }   from './tools/discovery.js';
import { multidbTools,     ejecutarMultidb }      from './tools/multidb.js';
import { indicadoresTools, ejecutarIndicadores }  from './tools/indicadores.js';
import { escenarioTools,   ejecutarEscenarios }   from './tools/escenarios.js';
import { construirMensajesCFO }                   from './prompts/cfo-system.js';
import { cerrarConexiones }                       from './db.js';

// ── Servidor MCP ──────────────────────────────────────────────────
const server = new McpServer({
  name:    'mcp-contabilidad',
  version: '1.0.0',
});

// ── Prompt: CFO virtual ───────────────────────────────────────────
server.prompt(
  'cfo-analisis',
  'Activa el modo CFO virtual con semáforos, benchmarks y recomendaciones accionables. ' +
  'Opcionalmente filtra por agencia (CAMA, ANAV) y período (ej: 2025, Q1-2025).',
  {
    agencia:             z.string().optional(),
    periodo:             z.string().optional(),
    contexto_adicional:  z.string().optional(),
  },
  (args: { agencia?: string; periodo?: string; contexto_adicional?: string }) => ({
    messages: construirMensajesCFO(args),
  }),
);

// ── Tools: discovery, multidb, indicadores, escenarios ───────────
const allGroups = [
  { tools: discoveryTools,   handler: ejecutarDiscovery   },
  { tools: multidbTools,     handler: ejecutarMultidb     },
  { tools: indicadoresTools, handler: ejecutarIndicadores },
  { tools: escenarioTools,   handler: ejecutarEscenarios  },
];

for (const { tools, handler } of allGroups) {
  for (const tool of tools) {
    server.tool(
      tool.name,
      tool.description,
      buildZodShape(tool.inputSchema),
      async (args: any) => {
        try {
          const text = await handler(tool.name, args);
          return { content: [{ type: 'text', text }] };
        } catch (err: any) {
          return {
            content: [{ type: 'text', text: `Error: ${err.message}` }],
            isError: true,
          };
        }
      }
    );
  }
}

// ── Arrancar ──────────────────────────────────────────────────────
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[MCP Contabilidad] Servidor iniciado — solo lectura');
}

main().catch((err) => {
  console.error('[MCP Contabilidad] Error fatal:', err);
  cerrarConexiones().finally(() => process.exit(1));
});

// ── Helper: convierte inputSchema JSON a shape de Zod ─────────────
function buildZodShape(schema: any): Record<string, z.ZodType> {
  if (!schema?.properties) return {};
  const shape: Record<string, z.ZodType> = {};
  const required: string[] = schema.required ?? [];

  for (const [key, def] of Object.entries(schema.properties as Record<string, any>)) {
    let zodType: z.ZodType;

    if (def.type === 'string' && def.enum) {
      zodType = z.enum(def.enum as [string, ...string[]]);
    } else if (def.type === 'string') {
      zodType = z.string();
    } else if (def.type === 'number') {
      zodType = z.number();
    } else if (def.type === 'boolean') {
      zodType = z.boolean();
    } else if (def.type === 'object') {
      zodType = z.record(z.unknown());
    } else {
      zodType = z.unknown();
    }

    if (def.default !== undefined) zodType = zodType.default(def.default);
    if (!required.includes(key)) zodType = zodType.optional();

    shape[key] = zodType;
  }
  return shape;
}
