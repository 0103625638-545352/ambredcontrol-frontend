import { useState } from "react";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { api, abrirPdfEnNuevaPestana, type GuiaRemision, type RespuestaPaginada } from "../api/client";
import { EstadoBadge } from "../components/EstadoBadge";
import { Paginacion } from "../components/Paginacion";
import { useToast } from "../components/ToastProvider";

const TAMANO_PAGINA = 20;

// Historial de guías de remisión (documento de transporte, ver
// ModalGenerarGuiaRemision.tsx para la creación — nace siempre desde una
// factura autorizada, botón "Generar guía de remisión" en Facturas).
export function GuiasRemisionPage() {
  const queryClient = useQueryClient();
  const { mostrarToast } = useToast();
  const [pagina, setPagina] = useState(1);

  const { data: respuesta, isLoading } = useQuery({
    queryKey: ["guias-remision", pagina],
    queryFn: async () =>
      (await api.get<RespuestaPaginada<GuiaRemision>>("/guias-remision", { params: { page: pagina, pageSize: TAMANO_PAGINA } })).data,
    placeholderData: keepPreviousData,
  });
  const guias = respuesta?.datos;

  const enviarSri = useMutation({
    mutationFn: async (guiaId: number) => api.post(`/guias-remision/${guiaId}/enviar-sri`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["guias-remision"] }),
    onError: (error: any) => mostrarToast(error.response?.data?.error ?? "Error al enviar al SRI"),
  });

  const consultarAutorizacion = useMutation({
    mutationFn: async (guiaId: number) => api.get(`/guias-remision/${guiaId}/consultar-autorizacion`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["guias-remision"] }),
    onError: (error: any) => mostrarToast(error.response?.data?.error ?? "Error al consultar autorización"),
  });

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-1">Guías de Remisión</h2>
        <p className="text-xs text-gray-400 dark:text-gray-500">
          Documento de transporte que acompaña la mercadería ya vendida — se genera desde una factura autorizada
          (botón "Generar guía de remisión" en Facturas).
        </p>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-900/50 text-left text-gray-600 dark:text-gray-300">
            <tr>
              <th className="px-4 py-2">No.</th>
              <th className="px-4 py-2">Factura</th>
              <th className="px-4 py-2">Destinatario</th>
              <th className="px-4 py-2">Placa</th>
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
            {!isLoading && guias?.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-4 text-center text-gray-400 dark:text-gray-500">
                  No hay guías de remisión generadas
                </td>
              </tr>
            )}
            {guias?.map((g) => (
              <tr key={g.id} className="border-t border-gray-100 dark:border-gray-700">
                <td className="px-4 py-2 font-mono text-xs">{g.secuencial}</td>
                <td className="px-4 py-2 font-mono text-xs">{g.factura.secuencial}</td>
                <td className="px-4 py-2">{g.destinatarioRazonSocial}</td>
                <td className="px-4 py-2">{g.placa}</td>
                <td className="px-4 py-2">
                  <EstadoBadge estado={g.estado} />
                </td>
                <td className="px-4 py-2 text-right space-x-3">
                  <button
                    onClick={() => abrirPdfEnNuevaPestana(`/guias-remision/${g.id}/ride`)}
                    className="text-slate-700 dark:text-slate-300 hover:underline text-xs font-medium"
                  >
                    Ver PDF
                  </button>
                  {g.estado === "CREADA" && (
                    <button
                      onClick={() => enviarSri.mutate(g.id)}
                      disabled={enviarSri.isPending}
                      className="text-emerald-700 dark:text-emerald-400 hover:underline text-xs font-medium disabled:opacity-40"
                    >
                      {enviarSri.isPending ? "Enviando..." : "Enviar al SRI"}
                    </button>
                  )}
                  {g.estado === "ENVIADA" && (
                    <button
                      onClick={() => consultarAutorizacion.mutate(g.id)}
                      disabled={consultarAutorizacion.isPending}
                      className="text-emerald-700 dark:text-emerald-400 hover:underline text-xs font-medium disabled:opacity-40"
                    >
                      Consultar autorización
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
