const coloresEstado: Record<string, string> = {
  CREADA: "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300",
  ENVIADA: "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300",
  AUTORIZADA: "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300",
  REGISTRADA: "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300",
  RECHAZADA: "bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300",
  ANULADA: "bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400",
  CONVERTIDA: "bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300",
  // Estados de pago (Factura/Compra) — comparten badge con los estados fiscales.
  PENDIENTE: "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300",
  PARCIAL: "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300",
  PAGADA: "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300",
  // Estados de una CajaSesion (apertura/cierre de caja).
  ABIERTA: "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300",
  CERRADA: "bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400",
  // Tipo de movimiento en el reporte de Cobros Bancarios: dinero que entra vs sale.
  COBRO: "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300",
  PAGO: "bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300",
};

export function EstadoBadge({ estado }: { estado: string }) {
  return (
    <span className={`px-2 py-1 rounded-full text-xs font-medium ${coloresEstado[estado] ?? "bg-gray-100"}`}>
      {estado}
    </span>
  );
}
