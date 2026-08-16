import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type ClienteFacturableInternet } from "../api/client";
import { useConfirm } from "../components/ConfirmProvider";
import { useToast } from "../components/ToastProvider";
import { ModalRegistrarPagoInternet } from "../components/ModalRegistrarPagoInternet";

// Facturación del servicio de internet: pantalla SEPARADA de "Facturas" a
// propósito (la venta de equipos/visitas técnicas sigue por ahí, eligiendo
// productos a mano). Flujo real con muchos clientes (ver la conversación
// que llevó a esto): del 01 al 05 del mes se registran los COBROS a medida
// que llegan (ver ModalRegistrarPagoInternet — antes de que exista la
// factura, queda como cobro adelantado); del 06 en adelante, "Facturar a
// todos los pagados" genera de una sola vez la factura de cada cliente que
// ya pagó, adoptando ese mismo cobro. El botón "Facturar" individual sigue
// para el caso suelto (un cliente puntual, sin esperar al lote). Sigue
// siendo manual: nada se genera solo ni por calendario — el admin decide
// cuándo (ver backend/src/routes/facturasInternet.ts).
function mismoMes(fechaIso: string): boolean {
  const f = new Date(fechaIso);
  const hoy = new Date();
  return f.getFullYear() === hoy.getFullYear() && f.getMonth() === hoy.getMonth();
}

function formatearFecha(fechaIso: string): string {
  return new Date(fechaIso).toLocaleDateString("es-EC", { day: "2-digit", month: "short", year: "numeric" });
}

const BADGE_BASE = "text-xs font-medium px-2 py-0.5 rounded-full";

function estadoCliente(c: ClienteFacturableInternet): { texto: string; clase: string } {
  if (c.cobroPendiente) {
    return { texto: "Pagado, falta facturar", clase: `${BADGE_BASE} bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300` };
  }
  if (!c.ultimaFacturaInternet) {
    return { texto: "Nunca facturado", clase: `${BADGE_BASE} bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300` };
  }
  const facturadoEsteMes = mismoMes(c.ultimaFacturaInternet.fechaEmision);
  const pagado = c.ultimaFacturaInternet.estadoPago === "PAGADA";
  if (pagado && facturadoEsteMes) {
    return { texto: "Pagado este mes", clase: `${BADGE_BASE} bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300` };
  }
  if (facturadoEsteMes) {
    return { texto: "Facturado, sin pago", clase: `${BADGE_BASE} bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300` };
  }
  return { texto: "Pendiente este mes", clase: `${BADGE_BASE} bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300` };
}

export function FacturacionInternetPage() {
  const queryClient = useQueryClient();
  const confirmar = useConfirm();
  const { mostrarToast } = useToast();
  const [busqueda, setBusqueda] = useState("");
  const [clienteRegistrandoPago, setClienteRegistrandoPago] = useState<ClienteFacturableInternet | null>(null);

  const { data: clientes, isLoading } = useQuery({
    queryKey: ["facturas-internet-clientes"],
    queryFn: async () => (await api.get<ClienteFacturableInternet[]>("/facturas-internet/clientes")).data,
  });

  // Ciclo de corte editable desde Ajustes (ver AjustesPage.tsx) — se lee acá
  // solo para mostrar el texto de ayuda con los días reales configurados,
  // en vez de un "del 01 al 05" fijo que quedaría desactualizado apenas
  // alguien cambie la regla.
  const { data: empresaConfig } = useQuery({
    queryKey: ["configuracion-empresa"],
    queryFn: async () => (await api.get<{ diaInicioCorte: number; diaFinCorte: number }>("/configuracion/empresa")).data,
  });
  const diaInicio = empresaConfig?.diaInicioCorte ?? 1;
  const diaFin = empresaConfig?.diaFinCorte ?? 5;

  const facturar = useMutation({
    mutationFn: async (clienteId: number) => (await api.post(`/facturas-internet/${clienteId}`)).data,
    onSuccess: (factura) => {
      queryClient.invalidateQueries({ queryKey: ["facturas-internet-clientes"] });
      mostrarToast(`Factura ${factura.secuencial} creada`);
    },
    onError: (error: any) => mostrarToast(error.response?.data?.error ?? "Error al facturar el plan de internet"),
  });

  const facturarLote = useMutation({
    mutationFn: async () => (await api.post("/facturas-internet/facturar-pagados")).data,
    onSuccess: (resumen: { total: number; exitosos: number; fallidos: number; detalle: { razonSocial: string; ok: boolean; error?: string }[] }) => {
      queryClient.invalidateQueries({ queryKey: ["facturas-internet-clientes"] });
      if (resumen.fallidos > 0) {
        const primerError = resumen.detalle.find((d) => !d.ok);
        mostrarToast(
          `${resumen.exitosos} factura(s) generada(s), ${resumen.fallidos} con error (ej. ${primerError?.razonSocial}: ${primerError?.error})`,
          "error"
        );
      } else {
        mostrarToast(`${resumen.exitosos} factura(s) generada(s)`, "success");
      }
    },
    onError: (error: any) => mostrarToast(error.response?.data?.error ?? "Error al facturar los pagos pendientes"),
  });

  async function confirmarFacturar(c: ClienteFacturableInternet) {
    const ok = await confirmar(
      `¿Facturar el plan "${c.planInternet?.nombre}" ($${c.planInternet?.precio}) a ${c.razonSocial}?`
    );
    if (ok) facturar.mutate(c.id);
  }

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return clientes ?? [];
    return (clientes ?? []).filter(
      (c) =>
        c.razonSocial.toLowerCase().includes(q) ||
        c.identificacion.toLowerCase().includes(q) ||
        (c.direccionIp ?? "").toLowerCase().includes(q) ||
        (c.planInternet?.nombre ?? "").toLowerCase().includes(q)
    );
  }, [clientes, busqueda]);

  const clientesConCobroPendiente = (clientes ?? []).filter((c) => c.cobroPendiente);

  async function confirmarFacturarLote() {
    const ok = await confirmar(
      `¿Facturar a los ${clientesConCobroPendiente.length} cliente(s) con un cobro registrado y sin facturar? Se genera una factura por cada uno, ya marcada como pagada.`
    );
    if (ok) facturarLote.mutate();
  }

  return (
    <div>
      <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-1">Facturación de Internet</h2>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
        Del {String(diaInicio).padStart(2, "0")} al {String(diaFin).padStart(2, "0")}, registra cada cobro a medida que llega con "Registrar pago" (queda como cobro adelantado si todavía no hay factura). Del {String(diaFin + 1).padStart(2, "0")} en adelante, "Facturar a todos los pagados" genera de una sola vez la factura de cada cliente que ya pagó. El servicio se reactiva solo apenas se registra el cobro; si nadie paga después del día {diaFin}, se suspende solo (editable en Ajustes).
      </p>

      <div className="flex items-center gap-3 mb-4">
        <input
          placeholder="Buscar por cliente, cédula/RUC, IP o plan..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm w-full max-w-md"
        />
        <button
          onClick={confirmarFacturarLote}
          disabled={facturarLote.isPending || clientesConCobroPendiente.length === 0}
          className="bg-sky-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-sky-700 disabled:opacity-50 whitespace-nowrap"
        >
          {facturarLote.isPending
            ? "Facturando..."
            : `Facturar a todos los pagados${clientesConCobroPendiente.length > 0 ? ` (${clientesConCobroPendiente.length})` : ""}`}
        </button>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-700 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-900/50 text-left text-gray-600 dark:text-gray-300">
            <tr>
              <th className="px-4 py-2">Cliente</th>
              <th className="px-4 py-2">Plan</th>
              <th className="px-4 py-2">Nodo / IP</th>
              <th className="px-4 py-2">Estado</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={5} className="px-4 py-4 text-center text-gray-400 dark:text-gray-500">Cargando...</td>
              </tr>
            )}
            {!isLoading && filtrados.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-4 text-center text-gray-400 dark:text-gray-500">
                  {clientes?.length === 0 ? "Ningún cliente tiene un plan de internet asignado todavía" : "Sin resultados"}
                </td>
              </tr>
            )}
            {filtrados.map((c) => {
              const estado = estadoCliente(c);
              const pagadoEsteMes = c.ultimaFacturaInternet ? mismoMes(c.ultimaFacturaInternet.fechaEmision) && c.ultimaFacturaInternet.estadoPago === "PAGADA" : false;
              return (
                <tr key={c.id} className="border-t border-gray-100 dark:border-gray-700">
                  <td className="px-4 py-2">
                    <div className="font-medium text-gray-800 dark:text-gray-100">{c.razonSocial}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">{c.identificacion}</div>
                  </td>
                  <td className="px-4 py-2">
                    <div className="text-gray-800 dark:text-gray-100">{c.planInternet?.nombre}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">${c.planInternet?.precio}/mes</div>
                    <div className="text-xs text-gray-400 dark:text-gray-500">
                      {c.fechaContrato
                        ? `Día de corte: ${new Date(c.fechaContrato).getDate()}`
                        : `Día de corte general (${diaFin})`}
                    </div>
                  </td>
                  <td className="px-4 py-2 text-gray-600 dark:text-gray-300">
                    <div>{c.nodo?.nombre ?? "—"}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">{c.direccionIp ?? "sin IP"}</div>
                  </td>
                  <td className="px-4 py-2">
                    <span className={estado.clase}>{estado.texto}</span>
                    {c.cobroPendiente ? (
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        ${c.cobroPendiente.total} · {formatearFecha(c.cobroPendiente.ultimaFecha)}
                      </div>
                    ) : c.ultimaFacturaInternet ? (
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        {c.ultimaFacturaInternet.secuencial} · {formatearFecha(c.ultimaFacturaInternet.fechaEmision)}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-4 py-2 text-right space-x-2 whitespace-nowrap">
                    {!pagadoEsteMes && (
                      <button
                        onClick={() => setClienteRegistrandoPago(c)}
                        className="bg-sky-600 text-white px-3 py-1.5 rounded-md text-xs font-medium hover:bg-sky-700"
                      >
                        Registrar pago
                      </button>
                    )}
                    {!c.cobroPendiente && (
                      <button
                        onClick={() => confirmarFacturar(c)}
                        disabled={facturar.isPending}
                        className="bg-brand-600 text-white px-3 py-1.5 rounded-md text-xs font-medium hover:bg-brand-700 disabled:opacity-50"
                      >
                        Facturar
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {clienteRegistrandoPago && (
        <ModalRegistrarPagoInternet
          cliente={clienteRegistrandoPago}
          onCerrar={() => setClienteRegistrandoPago(null)}
          onPagado={() => setClienteRegistrandoPago(null)}
        />
      )}
    </div>
  );
}
