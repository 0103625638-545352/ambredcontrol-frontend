import { useState } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { api, type RegistroAuditoria, type RespuestaPaginada } from "../api/client";
import { Paginacion } from "../components/Paginacion";
import { useFiltrosListado, BarraBuscadorDocumentos } from "../components/BuscadorDocumentos";
import { CLASE_THEAD, PanelListado, Resaltar } from "../components/FormatoDocumento";

const TAMANO_PAGINA = 30;

// Etiquetas legibles para cada "accion" — el backend guarda el código
// (ej. "ANULAR_FACTURA") y acá solo lo traducimos para mostrar.
const ETIQUETAS_ACCION: Record<string, string> = {
  ANULAR_FACTURA: "Anuló factura",
  ANULAR_NOTA_VENTA: "Anuló nota de venta",
  ANULAR_COMPRA: "Anuló compra",
  ANULAR_PROFORMA: "Anuló proforma",
  ELIMINAR_PAGO: "Eliminó un pago",
  EDITAR_PRODUCTO: "Editó producto",
  DESACTIVAR_PRODUCTO: "Desactivó producto",
  EDITAR_CLIENTE: "Editó cliente",
  EDITAR_PROVEEDOR: "Editó proveedor",
  DESACTIVAR_PROVEEDOR: "Desactivó proveedor",
  EDITAR_CATEGORIA: "Editó categoría",
  DESACTIVAR_CATEGORIA: "Desactivó categoría",
  CREAR_USUARIO: "Creó usuario",
  DESACTIVAR_USUARIO: "Desactivó usuario",
  CREAR_NOTA_CREDITO: "Creó nota de crédito",
  DAR_DE_BAJA_CLIENTE: "Dio de baja cliente",
  IMPONER_MULTA_CLIENTE: "Impuso multa a cliente",
};

// Color según qué tan "destructiva" es la acción: anular/desactivar/eliminar
// en rojo, editar en ámbar, crear en verde — para poder escanear la lista de
// un vistazo sin leer cada fila. DAR_DE_BAJA_CLIENTE/IMPONER_MULTA_CLIENTE no
// calzan en ningún prefijo genérico, así que se tratan aparte: una baja es
// tan definitiva como anular/desactivar, y una multa es un cargo punitivo,
// no una "creación" cualquiera.
function colorAccion(accion: string): string {
  if (
    accion.startsWith("ANULAR") ||
    accion.startsWith("DESACTIVAR") ||
    accion.startsWith("ELIMINAR") ||
    accion === "DAR_DE_BAJA_CLIENTE"
  ) {
    return "bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300";
  }
  if (accion.startsWith("EDITAR") || accion === "IMPONER_MULTA_CLIENTE") {
    return "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300";
  }
  return "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300";
}

export function AuditoriaPage() {
  const [pagina, setPagina] = useState(1);
  // Buscador compartido de los listados (en el servidor: la lista pagina).
  // El filtro de "estado" de la barra es la acción registrada.
  const filtros = useFiltrosListado(setPagina);

  const { data: acciones } = useQuery({
    queryKey: ["auditoria-acciones"],
    queryFn: async () => (await api.get<string[]>("/auditoria/acciones")).data,
  });

  const { data: respuesta, isLoading, isFetching } = useQuery({
    queryKey: ["auditoria", pagina, ...filtros.clave],
    queryFn: async () =>
      (
        await api.get<RespuestaPaginada<RegistroAuditoria>>("/auditoria", {
          params: {
            page: pagina,
            pageSize: TAMANO_PAGINA,
            q: filtros.busquedaAplicada || undefined,
            desde: filtros.desde || undefined,
            hasta: filtros.hasta || undefined,
            accion: filtros.estado || undefined,
          },
        })
      ).data,
    placeholderData: keepPreviousData,
  });
  const registros = respuesta?.datos;
  // Mientras llega el resultado de una búsqueda nueva, la tabla anterior
  // queda visible pero atenuada (en vez de parpadear en blanco).
  const buscando = isFetching && !isLoading;

  return (
    <div className="space-y-4">
      <PanelListado
        titulo="Auditoría"
        conteo={respuesta?.paginacion.total}
        singular="registro"
        plural="registros"
        aviso="Registro de acciones sensibles: anulaciones, ediciones, desactivaciones y eliminación de pagos. Solo se consulta, no se puede modificar."
      >
        <BarraBuscadorDocumentos
          filtros={filtros}
          etiquetaBusqueda="Buscar · detalle, documento, entidad o usuario"
          placeholder="Ej: 001-001-000000010, Producto, admin..."
          etiquetaEstado="Acción"
          opcionesEstado={acciones?.map((a) => ({ valor: a, etiqueta: ETIQUETAS_ACCION[a] ?? a }))}
          mostrarPago={false}
          autoFocus
        />

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className={CLASE_THEAD}>
              <tr>
                <th className="px-4 py-2 w-44">Fecha</th>
                <th className="px-4 py-2">Usuario</th>
                <th className="px-4 py-2">Acción</th>
                <th className="px-4 py-2">Entidad</th>
                <th className="px-4 py-2">Detalle</th>
              </tr>
            </thead>
            <tbody className={buscando ? "opacity-60 transition-opacity" : "transition-opacity"}>
              {isLoading && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-gray-400 dark:text-gray-500">
                    Cargando...
                  </td>
                </tr>
              )}
              {!isLoading && registros?.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-400 dark:text-gray-500">
                    {filtros.hayFiltros ? "Ningún registro coincide con la búsqueda." : "No hay registros de auditoría todavía."}
                  </td>
                </tr>
              )}
              {registros?.map((r) => (
                <tr key={r.id} className="border-t border-stone-100 dark:border-gray-700 hover:bg-stone-50 dark:hover:bg-gray-700/30 align-top">
                  <td className="px-4 py-2 font-mono text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                    {new Date(r.fecha).toLocaleString("es-EC")}
                  </td>
                  <td className="px-4 py-2">
                    {r.usuario ? (
                      <>
                        <Resaltar texto={r.usuario.nombre} termino={filtros.busquedaAplicada} />
                        {r.usuario.usuario && (
                          <span className="block font-mono text-[11px] text-gray-400 dark:text-gray-500">
                            <Resaltar texto={r.usuario.usuario} termino={filtros.busquedaAplicada} />
                          </span>
                        )}
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <span
                      className={`inline-block px-1.5 py-0.5 rounded-sm font-mono text-[10px] uppercase tracking-wider font-semibold whitespace-nowrap ${colorAccion(r.accion)}`}
                    >
                      {ETIQUETAS_ACCION[r.accion] ?? r.accion}
                    </span>
                  </td>
                  <td className="px-4 py-2 font-mono text-[11px] uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    <Resaltar texto={r.entidad ?? "—"} termino={filtros.busquedaAplicada} />
                    {r.entidadId != null && <span className="text-gray-400 dark:text-gray-500"> #{r.entidadId}</span>}
                  </td>
                  <td className="px-4 py-2 text-gray-700 dark:text-gray-200">
                    <Resaltar texto={r.detalle ?? "—"} termino={filtros.busquedaAplicada} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {respuesta && (
          <Paginacion
            page={respuesta.paginacion.page}
            totalPaginas={respuesta.paginacion.totalPaginas}
            total={respuesta.paginacion.total}
            onCambiarPagina={setPagina}
          />
        )}
      </PanelListado>
    </div>
  );
}
