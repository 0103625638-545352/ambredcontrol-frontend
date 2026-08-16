import { useState } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { api, type RegistroAuditoria, type RespuestaPaginada } from "../api/client";
import { Paginacion } from "../components/Paginacion";

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
};

// Color según qué tan "destructiva" es la acción: anular/desactivar/eliminar
// en rojo, editar en ámbar, crear en verde — para poder escanear la lista de
// un vistazo sin leer cada fila.
function colorAccion(accion: string): string {
  if (accion.startsWith("ANULAR") || accion.startsWith("DESACTIVAR") || accion.startsWith("ELIMINAR")) {
    return "bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300";
  }
  if (accion.startsWith("EDITAR")) {
    return "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300";
  }
  return "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300";
}

export function AuditoriaPage() {
  const [pagina, setPagina] = useState(1);
  const [accionFiltro, setAccionFiltro] = useState("");

  const { data: acciones } = useQuery({
    queryKey: ["auditoria-acciones"],
    queryFn: async () => (await api.get<string[]>("/auditoria/acciones")).data,
  });

  const { data: respuesta, isLoading } = useQuery({
    queryKey: ["auditoria", pagina, accionFiltro],
    queryFn: async () =>
      (
        await api.get<RespuestaPaginada<RegistroAuditoria>>("/auditoria", {
          params: { page: pagina, pageSize: TAMANO_PAGINA, accion: accionFiltro || undefined },
        })
      ).data,
    placeholderData: keepPreviousData,
  });
  const registros = respuesta?.datos;

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Auditoría</h2>
        <select
          value={accionFiltro}
          onChange={(e) => {
            setAccionFiltro(e.target.value);
            setPagina(1);
          }}
          className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm"
        >
          <option value="">Todas las acciones</option>
          {acciones?.map((a) => (
            <option key={a} value={a}>
              {ETIQUETAS_ACCION[a] ?? a}
            </option>
          ))}
        </select>
      </div>

      <p className="text-xs text-gray-400 dark:text-gray-500 mb-4">
        Registro de acciones sensibles: anulaciones, ediciones, desactivaciones y eliminación de pagos.
      </p>

      <div className="bg-white dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-700 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-900/50 text-left text-gray-600 dark:text-gray-300">
            <tr>
              <th className="px-4 py-2">Fecha</th>
              <th className="px-4 py-2">Usuario</th>
              <th className="px-4 py-2">Acción</th>
              <th className="px-4 py-2">Detalle</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={4} className="px-4 py-4 text-center text-gray-400 dark:text-gray-500">
                  Cargando...
                </td>
              </tr>
            )}
            {!isLoading && registros?.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-4 text-center text-gray-400 dark:text-gray-500">
                  No hay registros de auditoría todavía
                </td>
              </tr>
            )}
            {registros?.map((r) => (
              <tr key={r.id} className="border-t border-gray-100 dark:border-gray-700">
                <td className="px-4 py-2 text-xs text-gray-500 dark:text-gray-400">
                  {new Date(r.fecha).toLocaleString("es-EC")}
                </td>
                <td className="px-4 py-2">{r.usuario ? r.usuario.nombre : "—"}</td>
                <td className="px-4 py-2">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${colorAccion(r.accion)}`}>
                    {ETIQUETAS_ACCION[r.accion] ?? r.accion}
                  </span>
                </td>
                <td className="px-4 py-2 text-gray-600 dark:text-gray-300">{r.detalle ?? "—"}</td>
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
