// Chips de color SÓLIDO (no el tinte suave de antes) — pedido explícito de
// "colores vivos" para todo el sistema. EstadoBadge se reutiliza en
// Facturas, Notas de Crédito/Venta, Compras, Caja, Cobros Bancarios, etc.,
// así que este único archivo modernIZA el badge de estado en TODA la app.
const coloresEstado: Record<string, string> = {
  CREADA: "bg-gray-500 text-white",
  ENVIADA: "bg-sky-600 text-white",
  AUTORIZADA: "bg-emerald-600 text-white",
  REGISTRADA: "bg-emerald-600 text-white",
  RECHAZADA: "bg-red-600 text-white",
  ANULADA: "bg-gray-400 dark:bg-gray-600 text-white",
  CONVERTIDA: "bg-sky-600 text-white",
  // Estados de pago (Factura/Compra) — comparten badge con los estados fiscales.
  PENDIENTE: "bg-amber-500 text-white",
  PARCIAL: "bg-sky-600 text-white",
  PAGADA: "bg-emerald-600 text-white",
  // Estados de una CajaSesion (apertura/cierre de caja).
  ABIERTA: "bg-emerald-600 text-white",
  CERRADA: "bg-gray-400 dark:bg-gray-600 text-white",
  // Tipo de movimiento en el reporte de Cobros Bancarios: dinero que entra vs sale.
  COBRO: "bg-emerald-600 text-white",
  PAGO: "bg-red-600 text-white",
};

export function EstadoBadge({ estado }: { estado: string }) {
  return (
    <span className={`inline-block px-1.5 py-0.5 rounded-sm font-mono text-[10px] font-semibold uppercase tracking-wider ${coloresEstado[estado] ?? "bg-gray-500 text-white"}`}>
      {estado}
    </span>
  );
}
