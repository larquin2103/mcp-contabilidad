# Convención de nomenclatura de bases de datos

## Patrón

```
{Módulo}{Agencia}{Año}
```

## Módulos actuales

| Código | Nombre completo     | Descripción                            |
|--------|---------------------|----------------------------------------|
| Fact   | Facturación         | Facturas, ventas, cobros               |
| Conta  | Contabilidad        | Asientos, balances, estados financieros|
| Inv    | Inventario          | Existencias, movimientos de almacén    |
| Nom    | Nómina              | Sueldos, liquidaciones, IRPF           |
| CxC    | Cuentas por Cobrar  | Deudores, vencimientos                 |
| CxP    | Cuentas por Pagar   | Acreedores, pagos pendientes           |
| Tes    | Tesorería           | Caja, bancos, flujo de caja            |
| AF     | Activos Fijos       | Inmovilizado, amortizaciones           |

## Agencias actuales

| Código | Nombre    |
|--------|-----------|
| CAMA   | Camaguey  |
| ANAV   | ANAV      |

## Ejemplos válidos

```
FactCAMA2025   → Facturación · Camaguey · 2025
ContaCAMA2024  → Contabilidad · Camaguey · 2024
FactANAV2025   → Facturación · ANAV · 2025
InvCAMA2023    → Inventario · Camaguey · 2023
```

## Añadir una nueva agencia

1. Editar `config/agencias.json` → sección `"agencias"`
2. El servidor MCP la detectará automáticamente en la siguiente consulta a `listar_bases_datos`

## Añadir un nuevo módulo

1. Editar `config/agencias.json` → sección `"modulos"`
2. No se requiere ningún otro cambio en el código
