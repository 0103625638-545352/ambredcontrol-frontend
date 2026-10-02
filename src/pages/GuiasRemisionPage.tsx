import { useState } from "react";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { api, abrirPdfEnNuevaPestana, type GuiaRemision } from "../api/client";
import { EstadoBadge } from "../components/EstadoBadge";
import { Paginacion } from "../components/Paginacion";
import { useToast } from "../components/ToastProvider";
import {
  useFiltrosListado,
  BarraBuscadorDocumentos,
  type RespuestaConResumen,
} from "../components/BuscadorDocumentos";
import {
  Resaltar,
  EncabezadoListado,
  PieConteo,
} from "../components/FormatoDocumento";

const TAMANO_PAGINA = 20;

// Historial de guías de remisión (documento de transporte, ver
// ModalGenerarGuiaRemision.tsx para la creación — nace siempre desde una
// factura autorizada, botón "Generar guía de remisión" en Facturas).
export function GuiasRemisionPage() {
  const queryClient = useQueryClient();
  const { mostrarToast } = useToast();
  const [pagina, setPagina] = useState(1);
  // Buscador dinámico del listado (ver components/BuscadorDocumentos.tsx).
  const filtros = useFiltrosListado(setPagina);

  const { data: respuesta, isLoading } = useQuery({
    queryKey: ["guias-remision", pagina, ...filtros.clave],
    queryFn: async () =>
      (await api.get<RespuestaConResumen<GuiaRemision>>("/guias-remision", { params: { page: pagina, pageSize: TAMANO_PAGINA, ...filtros.params } })).data,
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
      <div className="bg-white dark:bg-gray-800 border border-stone-300 dark:border-gray-700 overflow-hidden">
        <EncabezadoListado
          titulo="Guías de remisión"
          conteo={respuesta?.paginacion.total}
          singular="guía"
          plural="guías"
          aviso={'Documento de transporte que acompaña la mercadería ya vendida — se genera desde una factura autorizada (botón "Guía de remisión" en Facturas emitidas).'}
        />
        <BarraBuscadorDocumentos
          filtros={filtros}
          etiquetaBusqueda="Buscar · número, factura, destinatario, transportista o placa"
          placeholder="Ej: 000000008, ABC-1234..."
          opcionesEstado={[{ valor: "CREADA", etiqueta: "Creada" }, { valor: "ENVIADA", etiqueta: "Enviada" }, { valor: "AUTORIZADA", etiqueta: "Autorizada" }, { valor: "RECHAZADA", etiqueta: "Rechazada" }, { valor: "ANULADA", etiqueta: "Anulada" }]}
          mostrarPago={false}
        />
        <table className="w-full text-sm">
          <thead className="bg-stone-100 dark:bg-gray-900/60 border-b border-stone-300 dark:border-gray-700 text-left font-mono text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 [&_th]:font-medium">
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
                  {filtros.hayFiltros ? "Ningún documento coincide con la búsqueda." : "No hay guías de remisión generadas"}
                </td>
              </tr>
            )}
            {guias?.map((g) => (
              <tr key={g.id} className="border-t border-stone-100 dark:border-gray-700">
                <td className="px-4 py-2 font-mono text-xs"><Resaltar texto={g.secuencial} termino={filtros.busquedaAplicada} /></td>
                <td className="px-4 py-2 font-mono text-xs"><Resaltar texto={g.factura.secuencial} termino={filtros.busquedaAplicada} /></td>
                <td className="px-4 py-2"><Resaltar texto={g.destinatarioRazonSocial} termino={filtros.busquedaAplicada} /></td>
                <td className="px-4 py-2"><Resaltar texto={g.placa} termino={filtros.busquedaAplicada} /></td>
                <td className="px-4 py-2">
                  <EstadoBadge estado={g.estado} />
                </td>
                <td className="px-4 py-2 text-right space-x-3">
                  <button
                    onClick={() => abrirPdfEnNuevaPestana(`/guias-remision/${g.id}/ride`)}
                    className="text-brand-700 dark:text-brand-300 hover:underline text-xs font-medium"
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
        <PieConteo cantidad={guias?.length ?? 0} etiqueta="GUÍAS EN ESTA PÁGINA" hayFiltros={filtros.hayFiltros} />
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
