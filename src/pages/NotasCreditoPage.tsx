import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { api, abrirPdfEnNuevaPestana, type Factura, type FacturaConDetalle, type NotaCredito, type RespuestaPaginada } from "../api/client";
import { Paginacion } from "../components/Paginacion";
import { useToast } from "../components/ToastProvider";

const TAMANO_PAGINA = 20;

const coloresEstado: Record<string, string> = {
  CREADA: "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300",
  ENVIADA: "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300",
  AUTORIZADA: "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300",
  RECHAZADA: "bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300",
  ANULADA: "bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400",
};

interface Props {
  // Preselecciona esta factura al llegar desde el botón "Anular (nota de
  // crédito)" de Facturas — evita tener que volver a buscarla en el <select>.
  facturaIdInicial?: number | null;
  onFacturaIdInicialConsumida?: () => void;
}

export function NotasCreditoPage({ facturaIdInicial, onFacturaIdInicialConsumida }: Props = {}) {
  const queryClient = useQueryClient();
  const { mostrarToast } = useToast();
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [facturaSeleccionadaId, setFacturaSeleccionadaId] = useState<number | "">("");
  const [motivo, setMotivo] = useState("");
  // Cantidades a devolver por producto: { [productoId]: cantidad }
  const [cantidades, setCantidades] = useState<Record<number, number>>({});
  const [pagina, setPagina] = useState(1);

  useEffect(() => {
    if (!facturaIdInicial) return;
    setFacturaSeleccionadaId(facturaIdInicial);
    setCantidades({});
    setMostrarFormulario(true);
    onFacturaIdInicialConsumida?.();
    // Deps a propósito solo [facturaIdInicial]: debe reaccionar únicamente a
    // que llegue un id nuevo desde afuera, no a los cambios locales que el
    // propio <select> dispara sobre facturaSeleccionadaId/cantidades.
  }, [facturaIdInicial]);

  const { data: respuesta, isLoading } = useQuery({
    queryKey: ["notas-credito", pagina],
    queryFn: async () =>
      (await api.get<RespuestaPaginada<NotaCredito>>("/notas-credito", { params: { page: pagina, pageSize: TAMANO_PAGINA } })).data,
    placeholderData: keepPreviousData,
  });
  const notas = respuesta?.datos;

  // Solo mostramos facturas AUTORIZADAS en el selector — es la única
  // condición que el backend acepta para emitir una nota de crédito.
  // OJO: esta consulta NO manda "page", a propósito — necesita la lista
  // COMPLETA de facturas para poder filtrar y ofrecerlas todas en el <select>.
  const { data: facturas } = useQuery({
    queryKey: ["facturas"],
    queryFn: async () => (await api.get<Factura[]>("/facturas")).data,
  });
  const facturasAutorizadas = facturas?.filter((f) => f.estado === "AUTORIZADA") ?? [];

  const { data: facturaDetalle } = useQuery({
    queryKey: ["factura-detalle", facturaSeleccionadaId],
    queryFn: async () =>
      (await api.get<FacturaConDetalle>(`/facturas/${facturaSeleccionadaId}`)).data,
    enabled: facturaSeleccionadaId !== "",
  });

  const crearNota = useMutation({
    mutationFn: async () => {
      const items = Object.entries(cantidades)
        .filter(([, cantidad]) => cantidad > 0)
        .map(([productoId, cantidad]) => ({ productoId: Number(productoId), cantidad }));

      return api.post("/notas-credito", { facturaId: facturaSeleccionadaId, motivo, items });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notas-credito"] });
      queryClient.invalidateQueries({ queryKey: ["productos"] }); // el stock cambió
      setMostrarFormulario(false);
      setFacturaSeleccionadaId("");
      setMotivo("");
      setCantidades({});
    },
  });

  const enviarSri = useMutation({
    mutationFn: async (notaId: number) => api.post(`/notas-credito/${notaId}/enviar-sri`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notas-credito"] }),
    onError: (error: any) => mostrarToast(error.response?.data?.error ?? "Error al enviar al SRI"),
  });

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Notas de Crédito</h2>
        <button
          onClick={() => setMostrarFormulario(!mostrarFormulario)}
          className="bg-slate-800 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-slate-700"
        >
          {mostrarFormulario ? "Cancelar" : "+ Nueva nota de crédito"}
        </button>
      </div>

      {mostrarFormulario && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            crearNota.mutate();
          }}
          className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm mb-4 space-y-3"
        >
          <div>
            <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Factura a corregir (solo autorizadas)</label>
            <select
              required
              value={facturaSeleccionadaId}
              onChange={(e) => {
                setFacturaSeleccionadaId(e.target.value ? Number(e.target.value) : "");
                setCantidades({});
              }}
              className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm w-full"
            >
              <option value="">Selecciona una factura...</option>
              {facturasAutorizadas.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.secuencial} — {f.cliente.razonSocial} — ${f.total}
                </option>
              ))}
            </select>
            {facturasAutorizadas.length === 0 && (
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                No tienes ninguna factura autorizada todavía. Solo se pueden emitir notas de crédito sobre facturas ya autorizadas por el SRI.
              </p>
            )}
          </div>

          {facturaDetalle && (
            <div className="border border-gray-200 dark:border-gray-700 rounded-md p-3">
              <div className="flex items-center justify-between gap-2 mb-2">
                <p className="text-xs text-gray-600 dark:text-gray-400">
                  Indica cuánto se devuelve de cada producto (déjalo en 0 si no se devuelve):
                </p>
                <button
                  type="button"
                  onClick={() =>
                    setCantidades(
                      Object.fromEntries(facturaDetalle.detalles.map((d) => [d.productoId, d.cantidad]))
                    )
                  }
                  className="text-red-600 dark:text-red-400 hover:underline text-xs font-medium shrink-0"
                >
                  Anular factura completa
                </button>
              </div>
              {facturaDetalle.detalles.map((d) => (
                <div key={d.id} className="flex items-center justify-between gap-2 py-1 text-sm">
                  <span className="text-gray-700 dark:text-gray-300">
                    {d.producto.nombre} (vendidos: {d.cantidad})
                  </span>
                  <input
                    type="number"
                    min={0}
                    max={d.cantidad}
                    value={cantidades[d.productoId] ?? 0}
                    onChange={(e) =>
                      setCantidades({ ...cantidades, [d.productoId]: Number(e.target.value) })
                    }
                    className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-2 py-1 text-sm w-20 text-right"
                  />
                </div>
              ))}
            </div>
          )}

          <div>
            <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Motivo</label>
            <input
              type="text"
              required
              placeholder="Ej: Devolución de mercadería en mal estado"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm w-full"
            />
          </div>

          <button
            type="submit"
            disabled={crearNota.isPending}
            className="bg-emerald-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
          >
            {crearNota.isPending ? "Guardando..." : "Crear nota de crédito"}
          </button>
          {crearNota.isError && (
            <p className="text-red-600 dark:text-red-400 text-sm">
              {(crearNota.error as any)?.response?.data?.error ?? "Error al crear la nota de crédito"}
            </p>
          )}
        </form>
      )}

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-900/50 text-left text-gray-600 dark:text-gray-300">
            <tr>
              <th className="px-4 py-2">No.</th>
              <th className="px-4 py-2">Factura corregida</th>
              <th className="px-4 py-2">Motivo</th>
              <th className="px-4 py-2 text-right">Total</th>
              <th className="px-4 py-2">Estado</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={6} className="px-4 py-4 text-center text-gray-400 dark:text-gray-500">Cargando...</td>
              </tr>
            )}
            {notas?.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-4 text-center text-gray-400 dark:text-gray-500">
                  No hay notas de crédito emitidas
                </td>
              </tr>
            )}
            {notas?.map((n) => (
              <tr key={n.id} className="border-t border-gray-100 dark:border-gray-700">
                <td className="px-4 py-2 font-mono text-xs">{n.secuencial}</td>
                <td className="px-4 py-2 font-mono text-xs">{n.factura.secuencial}</td>
                <td className="px-4 py-2">{n.motivo}</td>
                <td className="px-4 py-2 text-right">${n.total}</td>
                <td className="px-4 py-2">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${coloresEstado[n.estado] ?? "bg-gray-100"}`}>
                    {n.estado}
                  </span>
                </td>
                <td className="px-4 py-2 text-right space-x-3">
                  <button
                    onClick={() => abrirPdfEnNuevaPestana(`/notas-credito/${n.id}/ride`)}
                    className="text-slate-700 dark:text-slate-300 hover:underline text-xs font-medium"
                  >
                    Ver PDF
                  </button>
                  {n.estado === "CREADA" && (
                    <button
                      onClick={() => enviarSri.mutate(n.id)}
                      disabled={enviarSri.isPending}
                      className="text-emerald-700 dark:text-emerald-400 hover:underline text-xs font-medium disabled:opacity-40"
                    >
                      {enviarSri.isPending ? "Enviando..." : "Enviar al SRI"}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {respuesta && (
          <Paginacion
            page={respuesta.paginacion.page}
            totalPaginas={respuesta.paginacion.totalPaginas}
            total={respuesta.paginacion.total}
            onCambiarPagina={setPagina}
          />
        )}
      </div>
    </div>
  );
}
