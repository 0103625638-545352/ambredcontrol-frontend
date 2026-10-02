import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type ClienteFacturableInternet } from "../api/client";
import { useConfirm } from "../components/ConfirmProvider";
import { useToast } from "../components/ToastProvider";
import { ModalRegistrarPagoInternet } from "../components/ModalRegistrarPagoInternet";
import { BotonWhatsapp } from "../components/BotonWhatsapp";
import { useFiltrosListado, BarraBuscadorDocumentos, filtrarLocal, sinPaginacion } from "../components/BuscadorDocumentos";
import { Resaltar } from "../components/FormatoDocumento";

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

const BADGE_BASE = "font-mono text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-sm";

function estadoCliente(c: ClienteFacturableInternet): { texto: string; clase: string } {
  if (c.cobroPendiente) {
    return { texto: "Pagado, falta facturar", clase: `${BADGE_BASE} bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300` };
  }
  if (!c.ultimaFacturaInternet) {
    return { texto: "Nunca facturado", clase: `${BADGE_BASE} bg-stone-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300` };
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
    const precioTexto = c.promocionAplicable
      ? `$${c.promocionAplicable.precioConDescuento} (con la promo "${c.promocionAplicable.nombre}", antes $${c.planInternet?.precio})`
      : `$${c.planInternet?.precio}`;
    const ok = await confirmar(`¿Facturar el plan "${c.planInternet?.nombre}" (${precioTexto}) a ${c.razonSocial}?`);
    if (ok) facturar.mutate(c.id);
  }

  // Buscador compartido de los listados (en el navegador: la lista ya viene
  // completa) + filtro por el estado de cobro del mes.
  const filtros = useFiltrosListado(sinPaginacion);
  const filtrados =
    filtrarLocal(clientes, filtros, {
      textos: (c) => [c.razonSocial, c.identificacion, c.direccionIp, c.planInternet?.nombre],
      estado: (c) => estadoCliente(c).texto,
    }) ?? [];

  const clientesConCobroPendiente = (clientes ?? []).filter((c) => c.cobroPendiente);

  async function confirmarFacturarLote() {
    const ok = await confirmar(
      `¿Facturar a los ${clientesConCobroPendiente.length} cliente(s) con un cobro registrado y sin facturar? Se genera una factura por cada uno, ya marcada como pagada.`
    );
    if (ok) facturarLote.mutate();
  }

  // Pie del listado (como el de Facturas): conteo por estado de cobro y lo
  // que suman al mes los planes filtrados (con la promoción si aplica).
  const totalMensualFiltrado = filtrados.reduce(
    (acumulado, c) => acumulado + Number(c.promocionAplicable ? c.promocionAplicable.precioConDescuento : c.planInternet?.precio ?? 0),
    0
  );
  const conteoPorEstado = filtrados.reduce<Record<string, number>>((acumulado, c) => {
    const texto = estadoCliente(c).texto;
    acumulado[texto] = (acumulado[texto] ?? 0) + 1;
    return acumulado;
  }, {});

  return (
    <div>
      <div className="bg-white dark:bg-gray-800 border border-stone-300 dark:border-gray-700">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-stone-300 dark:border-gray-700">
          <h2 className="text-base font-bold text-gray-900 dark:text-gray-50">Facturación de internet</h2>
          <div className="flex items-center gap-3">
            <span className="font-mono text-[11px] text-gray-400 dark:text-gray-500">
              {clientes ? `${clientes.length} cliente${clientes.length === 1 ? "" : "s"} con plan` : ""}
            </span>
            <button
              onClick={confirmarFacturarLote}
              disabled={facturarLote.isPending || clientesConCobroPendiente.length === 0}
              className="bg-brand-700 text-white px-3 py-1.5 rounded-sm text-sm font-semibold hover:bg-brand-800 disabled:opacity-50 whitespace-nowrap"
            >
              {facturarLote.isPending
                ? "Facturando..."
                : `Facturar a todos los pagados${clientesConCobroPendiente.length > 0 ? ` (${clientesConCobroPendiente.length})` : ""}`}
            </button>
          </div>
        </div>
        <div className="px-4 py-2 bg-stone-50 dark:bg-gray-900/40 border-b border-stone-200 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400">
        Del {String(diaInicio).padStart(2, "0")} al {String(diaFin).padStart(2, "0")}, registra cada cobro a medida que llega con "Registrar pago" (queda como cobro adelantado si todavía no hay factura). Del {String(diaFin + 1).padStart(2, "0")} en adelante, "Facturar a todos los pagados" genera de una sola vez la factura de cada cliente que ya pagó. El servicio se reactiva solo apenas se registra el cobro; si nadie paga después del día {diaFin}, se suspende solo (editable en Ajustes).
      </div>
        <BarraBuscadorDocumentos
          filtros={filtros}
          etiquetaBusqueda="Buscar · cliente, cédula/RUC, IP o plan"
          placeholder="Ej: Pérez, 0102030405, 10.10.1.25..."
          opcionesEstado={[
            { valor: "Pendiente este mes", etiqueta: "Pendiente" },
            { valor: "Pagado, falta facturar", etiqueta: "Pagado, falta facturar" },
            { valor: "Facturado, sin pago", etiqueta: "Facturado, sin pago" },
            { valor: "Pagado este mes", etiqueta: "Pagado" },
            { valor: "Nunca facturado", etiqueta: "Nunca facturado" },
          ]}
          mostrarPago={false}
          mostrarFechas={false}
          autoFocus
        />
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-stone-100 dark:bg-gray-900/60 border-b border-stone-300 dark:border-gray-700 text-left font-mono text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 [&_th]:font-medium">
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
                  {clientes?.length === 0 ? "Ningún cliente tiene un plan de internet asignado todavía" : "Ningún cliente coincide con la búsqueda."}
                </td>
              </tr>
            )}
            {filtrados.map((c) => {
              const estado = estadoCliente(c);
              const pagadoEsteMes = c.ultimaFacturaInternet ? mismoMes(c.ultimaFacturaInternet.fechaEmision) && c.ultimaFacturaInternet.estadoPago === "PAGADA" : false;
              return (
                <tr key={c.id} className="border-t border-stone-100 dark:border-gray-700 hover:bg-stone-50 dark:hover:bg-gray-700/30 align-top">
                  <td className="px-4 py-2">
                    <div className="font-medium text-gray-800 dark:text-gray-100"><Resaltar texto={c.razonSocial} termino={filtros.busquedaAplicada} /></div>
                    <div className="font-mono text-[11px] text-gray-500 dark:text-gray-400"><Resaltar texto={c.identificacion} termino={filtros.busquedaAplicada} /></div>
                  </td>
                  <td className="px-4 py-2">
                    <div className="text-gray-800 dark:text-gray-100"><Resaltar texto={c.planInternet?.nombre ?? ""} termino={filtros.busquedaAplicada} /></div>
                    {c.promocionAplicable ? (
                      <div className="text-xs">
                        <span className="font-mono line-through text-gray-400 dark:text-gray-500">{c.planInternet?.precio}</span>{" "}
                        <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">{c.promocionAplicable.precioConDescuento}/mes</span>
                        <span className="ml-1.5 inline-block font-mono text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded-sm bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300">
                          -{Number(c.promocionAplicable.porcentajeDescuento)}% {c.promocionAplicable.nombre}
                        </span>
                      </div>
                    ) : (
                      <div className="font-mono text-xs text-gray-500 dark:text-gray-400">{c.planInternet?.precio}/mes</div>
                    )}
                    <div className="text-xs text-gray-400 dark:text-gray-500">
                      {c.fechaContrato
                        ? `Día de corte: ${new Date(c.fechaContrato).getDate()}`
                        : `Día de corte general (${diaFin})`}
                    </div>
                  </td>
                  <td className="px-4 py-2 text-gray-600 dark:text-gray-300">
                    <div>{c.nodo?.nombre ?? "—"}</div>
                    <div className="font-mono text-[11px] text-gray-500 dark:text-gray-400"><Resaltar texto={c.direccionIp ?? "sin IP"} termino={filtros.busquedaAplicada} /></div>
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
                    {!pagadoEsteMes && !c.cobroPendiente && (
                      <BotonWhatsapp
                        telefono={c.telefono}
                        titulo="Recordar pago por WhatsApp"
                        mensaje={`Hola ${c.razonSocial}, tu plan de internet ${c.planInternet?.nombre ?? ""} ($${
                          c.promocionAplicable ? c.promocionAplicable.precioConDescuento : c.planInternet?.precio
                        }/mes) está pendiente de pago este mes. Tu día de corte es el ${
                          c.fechaContrato ? new Date(c.fechaContrato).getDate() : diaFin
                        }. ¡Gracias!`}
                      />
                    )}
                    {!pagadoEsteMes && (
                      <button
                        onClick={() => setClienteRegistrandoPago(c)}
                        className="border border-emerald-600 text-emerald-700 dark:text-emerald-400 px-3 py-1.5 rounded-sm text-xs font-semibold hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
                      >
                        Registrar pago
                      </button>
                    )}
                    {!c.cobroPendiente && (
                      <button
                        onClick={() => confirmarFacturar(c)}
                        disabled={facturar.isPending}
                        className="bg-brand-700 text-white px-3 py-1.5 rounded-sm text-xs font-semibold hover:bg-brand-800 disabled:opacity-50"
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
        {filtrados.length > 0 && (
          <div className="flex flex-wrap items-center justify-end gap-x-6 gap-y-1 px-4 py-2.5 border-t-2 border-gray-900 dark:border-gray-200">
            <span className="font-mono text-[11px] uppercase tracking-wider text-gray-500 dark:text-gray-400">
              {filtrados.length} cliente{filtrados.length === 1 ? "" : "s"}
              {Object.entries(conteoPorEstado).map(([texto, n]) => ` · ${n} ${texto.toLowerCase()}`)}
            </span>
            <span className="text-sm font-bold text-gray-900 dark:text-gray-50">
              TOTAL MENSUAL USD <span className="font-mono tabular-nums ml-2">{totalMensualFiltrado.toFixed(2)}</span>
            </span>
          </div>
        )}
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
