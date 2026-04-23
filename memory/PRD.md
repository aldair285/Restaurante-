# PRD — Sanguchería POS

## Problem Statement
Sistema POS para restaurante (sanguchería) que gestione pedidos, cocina y cobro en tiempo real. Módulos: Administrador, Toma de Pedido (Mesero/Caja), Motor de Enrutamiento, Cocina (KDS), Caja (Pagos). Sincronización en tiempo real. Rapidez, precisión y facilidad de uso tipo comida rápida.

## User Choices
- Auth: JWT (usuario/contraseña)
- Real-time: WebSockets
- Demo: Sanguchería
- MVP incluye: combos, división de cuenta, descuentos
- Tickets: HTML imprimible

## Architecture
- **Backend**: FastAPI + Motor (MongoDB) + WebSockets; JWT Bearer auth
- **Frontend**: React + Tailwind + Shadcn; AuthContext (localStorage `pos_token`); route guards por rol
- **Design**: "Organic & Earthy" (terracotta #D45D3C + sand #F3E8E0), Work Sans + IBM Plex Sans

## Roles
- `admin`  → /admin (back office completo)
- `waiter` → /pos (toma de pedido)
- `cashier`→ /cashier (cobro)
- `kitchen`→ /kds (cocina)

## Implemented (2026-02)
- Login multi-rol con redirección por rol + botones demo
- Admin: CRUD de productos, categorías, modificadores, usuarios; flag `is_combo`
- Toma de Pedido: selección de mesa (1–12 o Para Llevar), carta por categoría, diálogo de modificadores/cantidad/nota, carrito editable, envío/edición de pedido, impresión de ticket
- KDS: tablero Kanban 3 columnas (Pendiente/Preparación/Listo) con temporizador y transiciones por WebSocket
- Caja: lista de pedidos abiertos, detalle, descuento + cargo extra, **división de cuenta** (multi-pago), métodos efectivo/transferencia/otro, ticket PDF/HTML imprimible
- WebSocket /api/ws broadcast: order.new, order.update, order.status, order.closed, order.cancel
- Seed: 4 usuarios demo + 4 categorías + 6 modificadores + 10 productos de sanguchería

## Implemented (2026-04 · Reports)
- **Módulo de Estadísticas y Reportes** (Admin → tab "Reportes", default):
  - KPIs: Hoy / Semana / Mes / Año con comparativa % vs periodo anterior
  - Filtros rápidos: Hoy, Ayer, Esta semana, Este mes, Este año + rango personalizado
  - Gráfico de evolución (line chart) ventas + pedidos por día/hora
  - Top 10 productos por ingresos (bar chart horizontal)
  - Distribución por método de pago (pie chart)
  - Horas pico + día de la semana (bar charts)
  - Menos vendidos (ranking con catálogo completo)
  - Detalle expandible de pedidos en el rango
  - Auto-refresh cada 60 s
- Seed histórico: ~280 pedidos pagados en los últimos 30 días (idempotente, marca `created_by:'seed'`)
- Backend: `/api/reports/kpis|timeseries|products|hourly|weekday|payment-methods|orders` (admin-only, 16/16 pytest pass)

## Test Credentials
Ver `/app/memory/test_credentials.md`

## Backlog
- P1: Reportes de ventas diarias / cierre de caja
- P1: Impresión directa a impresora térmica (ESC/POS)
- P1: Combos con selección de items (picker)
- P2: Inventario / stock
- P2: Histórico de pedidos cerrados con filtros
- P2: Multi-sucursal

## Tests
- Backend: 11/11 pytest tests pass (/app/backend/tests/test_pos_flow.py)
- Frontend e2e: flow waiter→kitchen→cashier verified
