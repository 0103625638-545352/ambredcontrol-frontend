import { useState } from "react";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { api, type CajaActual, type CajaSesion, type CajaAbierta, type Sucursal, type PuntoDeVenta, type RespuestaPaginada } from "../api/client";
import { Paginacion } from "../components/Paginacion";
import { useToast } from "../components/ToastProvider";
import { useMiSucursal, useEsAdmin } from "../context/AuthContext";
import { ModalMovimientoCaja } from "../components/ModalMovimientoCaja";
import { ModalCerrarCaja } from "../components/ModalCerrarCaja";
import { ModalDetalleCajaSesion } from "../components/ModalDetalleCajaSesion";

const TAMANO_PAGINA = 20;

function colorDiferencia(diferencia: string | null): string {
  if (diferencia === null) return "text-gray-400 dark:text-gray-500";
  const valor = parseFloat(diferencia);
  if (Math.abs(valor) <= 0.005) return "text-emerald-600 dark:text-emerald-400";
  return valor > 0 ? "text-sky-600 dark:text-sky-400" : "text-red-600 dark:text-red-400";
}

// Control general (admin): TODAS las cajas ABIERTAS ahora mismo, en
// cualquier punto de venta/sucursal — antes innecesaria (como mucho había
// una por sucursal); ahora que puede haber varias a la vez, esta es la
// única forma de verlas todas juntas en vivo.
function CajasAbiertasAhora() {
  const { data: abiertas, isLoading } = useQuery({
    queryKey: ["caja", "abiertas"],
    queryFn: async () => (await api.get<CajaAbierta[]>("/caja/abiertas")).data,
    refetchInterval: 30000,
  });

  return (
    <div>
      <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-4">Cajas abiertas ahora</h2>
      <div className="bg-white dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-700 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-900/50 text-left text-gray-600 dark:text-gray-300">
            <tr>
              <th className="px-4 py-2">Sucursal</th>
              <th className="px-4 py-2">Punto de venta</th>
              <th className="px-4 py-2">Cajero</th>
              <th className="px-4 py-2">Desde</th>
              <th className="px-4 py-2 text-right">Efectivo esperado</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={5} className="px-4 py-4 text-center text-gray-400 dark:text-gray-500">Cargando...</td>
              </tr>
            )}
            {!isLoading && abiertas?.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-4 text-center text-gray-400 dark:text-gray-500">No hay ninguna caja abierta en este momento</td>
              </tr>
            )}
            {abiertas?.map((s) => (
              <tr key={s.id} className="border-t border-gray-100 dark:border-gray-700">
                <td className="px-4 py-2">{s.sucursal.nombre}</td>
                <td className="px-4 py-2 text-gray-500 dark:text-gray-400">{s.puntoVenta?.nombre ?? "—"}</td>
                <td className="px-4 py-2">{s.abiertaPor.nombre}</td>
                <td className="px-4 py-2 text-xs">{new Date(s.abiertaEn).toLocaleString("es-EC")}</td>
                <td className="px-4 py-2 text-right font-semibold text-gray-900 dark:text-gray-100">${s.efectivoEsperado}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function CajaPage() {
  const queryClient = useQueryClient();
  const { mostrarToast } = useToast();
  const miSucursal = useMiSucursal();
  const esAdmin = useEsAdmin();

  const [montoInicial, setMontoInicial] = useState("");
  const [puntoVentaId, setPuntoVentaId] = useState<number | "">("");
  const [mostrarModalMovimiento, setMostrarModalMovimiento] = useState(false);
  const [mostrarModalCierre, setMostrarModalCierre] = useState(false);
  const [sesionDetalleId, setSesionDetalleId] = useState<number | null>(null);
  const [pagina, setPagina] = useState(1);
  const [filtroSucursalId, setFiltroSucursalId] = useState<number | "">("");

  const { data: actual, isLoading: cargandoActual } = useQuery({
    queryKey: ["caja", "actual"],
    queryFn: async () => (await api.get<CajaActual>("/caja/actual")).data,
  });

  // Puntos de venta de mi sucursal — opcional, solo se muestra el selector
  // si mi sucursal efectivamente definió alguno (ver PuntoDeVenta).
  const { data: puntosVenta } = useQuery({
    queryKey: ["puntos-venta", miSucursal?.id],
    queryFn: async () => (await api.get<PuntoDeVenta[]>("/puntos-venta", { params: { sucursalId: miSucursal!.id } })).data,
    enabled: !!miSucursal,
  });

  const abrirCaja = useMutation({
    mutationFn: async () =>
      api.post("/caja/abrir", { montoInicial: parseFloat(montoInicial), puntoVentaId: puntoVentaId || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["caja", "actual"] });
      queryClient.invalidateQueries({ queryKey: ["caja", "historial"] });
      queryClient.invalidateQueries({ queryKey: ["caja", "abiertas"] });
      setMontoInicial("");
      setPuntoVentaId("");
      mostrarToast("Caja abierta", "success");
    },
    onError: (error: any) => {
      mostrarToast(error.response?.data?.error ?? "Error al abrir la caja");
    },
  });

  // Solo ADMIN puede filtrar por sucursal — cualquier otro usuario ve siempre
  // la suya (el backend la fuerza igual, esto es solo para no mostrar un
  // selector inútil).
  const { data: sucursales } = useQuery({
    queryKey: ["sucursales"],
    queryFn: async () => (await api.get<Sucursal[]>("/sucursales")).data,
    enabled: esAdmin,
  });

  const { data: respuestaHistorial, isLoading: cargandoHistorial } = useQuery({
    queryKey: ["caja", "historial", pagina, filtroSucursalId],
    queryFn: async () =>
      (
        await api.get<RespuestaPaginada<CajaSesion>>("/caja/historial", {
          params: { page: pagina, pageSize: TAMANO_PAGINA, ...(filtroSucursalId ? { sucursalId: filtroSucursalId } : {}) },
        })
      ).data,
    placeholderData: keepPreviousData,
  });
  const historial = respuestaHistorial?.datos;

  const sesion = actual?.sesion;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-1">Caja</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          Sucursal: {miSucursal?.nombre ?? "Tu usuario no tiene sucursal asignada"}
        </p>

        {cargandoActual ? (
          <p className="text-sm text-gray-400 dark:text-gray-500">Cargando...</p>
        ) : !sesion ? (
          <div className="bg-white dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-700 p-4 max-w-sm">
            <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-3">Abrir caja</h3>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                abrirCaja.mutate();
              }}
              className="space-y-3"
            >
              <div>
                <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Efectivo con el que arrancas</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  autoFocus
                  placeholder="0.00"
                  value={montoInicial}
                  onChange={(e) => setMontoInicial(e.target.value)}
                  className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm"
                />
              </div>
              {puntosVenta && puntosVenta.length > 0 && (
                <div>
                  <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Punto de venta (opcional)</label>
                  <select
                    value={puntoVentaId}
                    onChange={(e) => setPuntoVentaId(e.target.value ? Number(e.target.value) : "")}
                    className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm"
                  >
                    <option value="">Caja de la sucursal completa</option>
                    {puntosVenta.map((p) => (
                      <option key={p.id} value={p.id}>{p.nombre}</option>
                    ))}
                  </select>
                </div>
              )}
              <button
                type="submit"
                disabled={abrirCaja.isPending}
                className="w-full bg-brand-600 text-white py-2 rounded-md text-sm font-medium hover:bg-brand-700 disabled:opacity-50"
              >
                {abrirCaja.isPending ? "Abriendo..." : "Abrir caja"}
              </button>
              {abrirCaja.isError && (
                <p className="text-red-600 dark:text-red-400 text-sm">
                  {(abrirCaja.error as any)?.response?.data?.error ?? "Error al abrir la caja"}
                </p>
              )}
            </form>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
            <div className="lg:col-span-2 bg-white dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-700 p-4">
              <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-3">
                Caja abierta por {sesion.abiertaPor.nombre}
                {sesion.puntoVenta && <span className="text-gray-500 dark:text-gray-400 font-normal"> — {sesion.puntoVenta.nombre}</span>}
                {" — "}
                {new Date(sesion.abiertaEn).toLocaleString("es-EC")}
              </h3>
              <table className="w-full text-sm mb-4">
                <tbody>
                  <tr className="border-b border-gray-100 dark:border-gray-700">
                    <td className="py-1.5 text-gray-500 dark:text-gray-400">Monto inicial</td>
                    <td className="py-1.5 text-right text-gray-800 dark:text-gray-100">${sesion.montoInicial}</td>
                  </tr>
                  <tr className="border-b border-gray-100 dark:border-gray-700">
                    <td className="py-1.5 text-gray-500 dark:text-gray-400">+ Ventas en efectivo</td>
                    <td className="py-1.5 text-right text-gray-800 dark:text-gray-100">${actual?.componentes?.ventasEfectivo}</td>
                  </tr>
                  <tr className="border-b border-gray-100 dark:border-gray-700">
                    <td className="py-1.5 text-gray-500 dark:text-gray-400">+ Ingresos manuales</td>
                    <td className="py-1.5 text-right text-gray-800 dark:text-gray-100">${actual?.componentes?.ingresosManuales}</td>
                  </tr>
                  <tr className="border-b border-gray-100 dark:border-gray-700">
                    <td className="py-1.5 text-gray-500 dark:text-gray-400">− Compras pagadas en efectivo</td>
                    <td className="py-1.5 text-right text-gray-800 dark:text-gray-100">${actual?.componentes?.comprasEfectivo}</td>
                  </tr>
                  <tr className="border-b border-gray-100 dark:border-gray-700">
                    <td className="py-1.5 text-gray-500 dark:text-gray-400">− Egresos manuales</td>
                    <td className="py-1.5 text-right text-gray-800 dark:text-gray-100">${actual?.componentes?.egresosManuales}</td>
                  </tr>
                  <tr>
                    <td className="py-1.5 text-gray-700 dark:text-gray-200 font-semibold">Efectivo esperado ahora</td>
                    <td className="py-1.5 text-right font-bold text-gray-900 dark:text-gray-100">${actual?.efectivoEsperado}</td>
                  </tr>
                </tbody>
              </table>

              <div className="flex gap-3">
                <button
                  onClick={() => setMostrarModalMovimiento(true)}
                  className="bg-slate-800 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-slate-700"
                >
                  Registrar movimiento
                </button>
                <button
                  onClick={() => setMostrarModalCierre(true)}
                  className="bg-red-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-red-700"
                >
                  Cerrar caja
                </button>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-700 p-4">
              <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-3">Movimientos de esta caja</h3>
              {sesion.movimientos?.length === 0 && <p className="text-sm text-gray-400 dark:text-gray-500">Sin movimientos manuales todavía</p>}
              {sesion.movimientos && sesion.movimientos.length > 0 && (
                <ul className="space-y-2 text-sm max-h-64 overflow-y-auto">
                  {sesion.movimientos.map((m) => (
                    <li key={m.id} className="flex justify-between border-b border-gray-100 dark:border-gray-700 pb-1.5">
                      <div>
                        <p className={m.tipo === "INGRESO" ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}>
                          {m.tipo === "INGRESO" ? "Ingreso" : "Egreso"}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">{m.motivo}</p>
                      </div>
                      <p className="font-medium text-gray-800 dark:text-gray-100">${m.monto}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>

      {esAdmin && <CajasAbiertasAhora />}

      <div>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Historial de caja</h2>
          {esAdmin && (
            <select
              value={filtroSucursalId}
              onChange={(e) => {
                setFiltroSucursalId(e.target.value ? Number(e.target.value) : "");
                setPagina(1);
              }}
              className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-3 py-1.5 text-sm"
            >
              <option value="">Todas las sucursales</option>
              {sucursales?.map((s) => (
                <option key={s.id} value={s.id}>{s.nombre}</option>
              ))}
            </select>
          )}
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-900/50 text-left text-gray-600 dark:text-gray-300">
              <tr>
                {esAdmin && <th className="px-4 py-2">Sucursal</th>}
                <th className="px-4 py-2">Punto de venta</th>
                <th className="px-4 py-2">Apertura</th>
                <th className="px-4 py-2">Cierre</th>
                <th className="px-4 py-2 text-right">Inicial</th>
                <th className="px-4 py-2 text-right">Esperado</th>
                <th className="px-4 py-2 text-right">Contado</th>
                <th className="px-4 py-2 text-right">Diferencia</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {cargandoHistorial && (
                <tr>
                  <td colSpan={esAdmin ? 9 : 8} className="px-4 py-4 text-center text-gray-400 dark:text-gray-500">Cargando...</td>
                </tr>
              )}
              {!cargandoHistorial && historial?.length === 0 && (
                <tr>
                  <td colSpan={esAdmin ? 9 : 8} className="px-4 py-4 text-center text-gray-400 dark:text-gray-500">Todavía no hay sesiones de caja</td>
                </tr>
              )}
              {historial?.map((s) => (
                <tr key={s.id} className="border-t border-gray-100 dark:border-gray-700">
                  {esAdmin && <td className="px-4 py-2">{s.sucursal.nombre}</td>}
                  <td className="px-4 py-2 text-gray-500 dark:text-gray-400">{s.puntoVenta?.nombre ?? "—"}</td>
                  <td className="px-4 py-2 text-xs">
                    {s.abiertaPor.nombre}
                    <br />
                    {new Date(s.abiertaEn).toLocaleString("es-EC")}
                  </td>
                  <td className="px-4 py-2 text-xs">
                    {s.estado === "ABIERTA" ? (
                      <span className="text-emerald-600 dark:text-emerald-400 font-medium">— abierta —</span>
                    ) : (
                      <>
                        {s.cerradaPor?.nombre}
                        <br />
                        {s.cerradaEn && new Date(s.cerradaEn).toLocaleString("es-EC")}
                      </>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right">${s.montoInicial}</td>
                  <td className="px-4 py-2 text-right">{s.montoEsperado !== null ? `$${s.montoEsperado}` : "—"}</td>
                  <td className="px-4 py-2 text-right">{s.montoContado !== null ? `$${s.montoContado}` : "—"}</td>
                  <td className={`px-4 py-2 text-right font-medium ${colorDiferencia(s.diferencia)}`}>
                    {s.diferencia !== null ? `$${s.diferencia}` : "—"}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <button
                      onClick={() => setSesionDetalleId(s.id)}
                      className="text-slate-700 dark:text-slate-300 hover:underline text-xs font-medium"
                    >
                      Ver
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {respuestaHistorial && (
            <Paginacion
              page={respuestaHistorial.paginacion.page}
              totalPaginas={respuestaHistorial.paginacion.totalPaginas}
              total={respuestaHistorial.paginacion.total}
              onCambiarPagina={setPagina}
            />
          )}
        </div>
      </div>

      {mostrarModalMovimiento && (
        <ModalMovimientoCaja onCerrar={() => setMostrarModalMovimiento(false)} onRegistrado={() => setMostrarModalMovimiento(false)} />
      )}

      {mostrarModalCierre && actual?.efectivoEsperado && (
        <ModalCerrarCaja
          efectivoEsperado={actual.efectivoEsperado}
          onCerrar={() => setMostrarModalCierre(false)}
          onCerrado={() => setMostrarModalCierre(false)}
        />
      )}

      {sesionDetalleId !== null && (
        <ModalDetalleCajaSesion cajaSesionId={sesionDetalleId} onCerrar={() => setSesionDetalleId(null)} />
      )}
    </div>
  );
}
