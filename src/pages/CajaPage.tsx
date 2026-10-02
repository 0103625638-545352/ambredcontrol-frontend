import { useState } from "react";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { api, type CajaActual, type CajaSesion, type CajaAbierta, type Sucursal, type PuntoDeVenta, type RespuestaPaginada } from "../api/client";
import { Paginacion } from "../components/Paginacion";
import { useToast } from "../components/ToastProvider";
import { useMiSucursal, useEsAdmin, useAuth } from "../context/AuthContext";
import { EstadoBadge } from "../components/EstadoBadge";
import {
  CLASE_CAMPO,
  CLASE_SOLO_LECTURA,
  CLASE_ETIQUETA,
  CLASE_TH,
  CLASE_THEAD,
  MarcoDocumento,
  Sello,
  ConteoItems,
  CabeceraDocumento,
  EtiquetaCabecera,
  DetalleDocumento,
  FilaDetalleVacia,
  CuadroTotales,
  FilaTotal,
  BotonConfirmar,
  MensajeError,
  SeccionListado,
  fechaHoy,
} from "../components/FormatoDocumento";
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
    <SeccionListado titulo="Cajas abiertas ahora">
        <table className="w-full text-sm">
          <thead className="bg-stone-100 dark:bg-gray-900/60 border-b border-stone-300 dark:border-gray-700 text-left font-mono text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 [&_th]:font-medium">
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
              <tr key={s.id} className="border-t border-stone-100 dark:border-gray-700">
                <td className="px-4 py-2">{s.sucursal.nombre}</td>
                <td className="px-4 py-2 text-gray-500 dark:text-gray-400">{s.puntoVenta?.nombre ?? "—"}</td>
                <td className="px-4 py-2">{s.abiertaPor.nombre}</td>
                <td className="px-4 py-2 font-mono text-xs">{new Date(s.abiertaEn).toLocaleString("es-EC")}</td>
                <td className="px-4 py-2 text-right font-mono tabular-nums font-semibold text-gray-900 dark:text-gray-100">{s.efectivoEsperado}</td>
              </tr>
            ))}
          </tbody>
        </table>
    </SeccionListado>
  );
}

export function CajaPage() {
  const queryClient = useQueryClient();
  const { mostrarToast } = useToast();
  const miSucursal = useMiSucursal();
  const esAdmin = useEsAdmin();
  const usuario = useAuth();

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
      {cargandoActual ? (
        <p className="text-sm text-gray-400 dark:text-gray-500">Cargando...</p>
      ) : !sesion ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            abrirCaja.mutate();
          }}
        >
          <MarcoDocumento
            titulo="Apertura de caja"
            sello={<Sello>Cerrada</Sello>}
            aviso="Registra el efectivo con el que arrancas. Desde ese momento, las ventas y compras en efectivo se suman a esta caja."
          >
            <CabeceraDocumento>
              <EtiquetaCabecera>Sucursal</EtiquetaCabecera>
              <div className={CLASE_SOLO_LECTURA}>{miSucursal?.nombre ?? "Tu usuario no tiene sucursal asignada"}</div>
              <EtiquetaCabecera>Fecha</EtiquetaCabecera>
              <div className={`${CLASE_SOLO_LECTURA} font-mono`}>{fechaHoy()}</div>

              <EtiquetaCabecera>Cajero</EtiquetaCabecera>
              <div className={CLASE_SOLO_LECTURA}>{usuario?.nombre ?? "—"}</div>
              <EtiquetaCabecera>Punto de venta</EtiquetaCabecera>
              {puntosVenta && puntosVenta.length > 0 ? (
                <select
                  value={puntoVentaId}
                  onChange={(e) => setPuntoVentaId(e.target.value ? Number(e.target.value) : "")}
                  className={CLASE_CAMPO}
                >
                  <option value="">Caja de la sucursal completa</option>
                  {puntosVenta.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre}
                    </option>
                  ))}
                </select>
              ) : (
                <div className={CLASE_SOLO_LECTURA}>Caja de la sucursal completa</div>
              )}
            </CabeceraDocumento>

            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-4 px-4 pb-4 items-end">
              <div />
              <div className="space-y-3">
                <label className="flex flex-col gap-1">
                  <span className={CLASE_ETIQUETA}>Efectivo con el que arrancas (USD)</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    autoFocus
                    placeholder="0.00"
                    value={montoInicial}
                    onChange={(e) => setMontoInicial(e.target.value)}
                    className={`${CLASE_CAMPO} text-right font-mono text-base`}
                  />
                </label>
                <BotonConfirmar type="submit" disabled={abrirCaja.isPending}>
                  {abrirCaja.isPending ? "Abriendo..." : "Abrir caja"}
                </BotonConfirmar>
                {abrirCaja.isError && (
                  <MensajeError>{(abrirCaja.error as any)?.response?.data?.error ?? "Error al abrir la caja"}</MensajeError>
                )}
              </div>
            </div>
          </MarcoDocumento>
        </form>
      ) : (
        <MarcoDocumento
          titulo="Caja abierta"
          sello={
            <>
              <ConteoItems cantidad={sesion.movimientos?.length ?? 0} singular="movimiento" plural="movimientos" />
              <Sello tono="marca">Abierta</Sello>
            </>
          }
        >
          <CabeceraDocumento>
            <EtiquetaCabecera>Sucursal</EtiquetaCabecera>
            <div className={CLASE_SOLO_LECTURA}>{miSucursal?.nombre ?? sesion.sucursal?.nombre ?? "—"}</div>
            <EtiquetaCabecera>Punto de venta</EtiquetaCabecera>
            <div className={CLASE_SOLO_LECTURA}>{sesion.puntoVenta?.nombre ?? "Caja de la sucursal completa"}</div>

            <EtiquetaCabecera>Abierta por</EtiquetaCabecera>
            <div className={CLASE_SOLO_LECTURA}>{sesion.abiertaPor.nombre}</div>
            <EtiquetaCabecera>Desde</EtiquetaCabecera>
            <div className={`${CLASE_SOLO_LECTURA} font-mono`}>{new Date(sesion.abiertaEn).toLocaleString("es-EC")}</div>
          </CabeceraDocumento>

          <div className="mx-4 flex items-center justify-between gap-2 border border-stone-300 dark:border-gray-700 bg-stone-50 dark:bg-gray-900/40 px-3 py-2">
            <span className="font-mono text-[10.5px] uppercase tracking-[0.15em] text-gray-600 dark:text-gray-300">
              Movimientos manuales de esta caja
            </span>
            <button
              onClick={() => setMostrarModalMovimiento(true)}
              className="text-brand-700 dark:text-brand-300 hover:underline text-xs font-semibold"
            >
              + Registrar movimiento
            </button>
          </div>
          <DetalleDocumento>
            <thead>
              <tr className="bg-stone-100 dark:bg-gray-900/60 border-b border-stone-300 dark:border-gray-700">
                <th className={`${CLASE_TH} w-10`}>#</th>
                <th className={`${CLASE_TH} w-40`}>Fecha</th>
                <th className={`${CLASE_TH} w-28`}>Tipo</th>
                <th className={CLASE_TH}>Motivo</th>
                <th className={`${CLASE_TH} w-40`}>Usuario</th>
                <th className={`${CLASE_TH} w-28 text-right`}>Monto</th>
              </tr>
            </thead>
            <tbody>
              {(sesion.movimientos?.length ?? 0) === 0 && (
                <FilaDetalleVacia columnas={6}>Sin movimientos manuales todavía.</FilaDetalleVacia>
              )}
              {sesion.movimientos?.map((m, indice) => (
                <tr key={m.id} className="border-b border-stone-100 dark:border-gray-700/60 last:border-b-0">
                  <td className="px-3 py-1.5 font-mono text-xs text-gray-400">{indice + 1}</td>
                  <td className="px-3 py-1.5 font-mono text-xs text-gray-500 dark:text-gray-400">
                    {new Date(m.fecha).toLocaleString("es-EC")}
                  </td>
                  <td className="px-3 py-1.5">
                    <span
                      className={`font-mono text-[10px] uppercase tracking-wider font-semibold ${
                        m.tipo === "INGRESO" ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400"
                      }`}
                    >
                      {m.tipo === "INGRESO" ? "+ Ingreso" : "− Egreso"}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 text-gray-800 dark:text-gray-100">{m.motivo}</td>
                  <td className="px-3 py-1.5 text-gray-500 dark:text-gray-400">{m.usuario?.nombre ?? "—"}</td>
                  <td className="px-3 py-1.5 font-mono text-right tabular-nums font-medium text-gray-900 dark:text-gray-50">
                    {m.monto}
                  </td>
                </tr>
              ))}
            </tbody>
          </DetalleDocumento>

          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] gap-4 p-4 items-start">
            <p className="text-xs text-gray-400 dark:text-gray-500 lg:pt-2">
              El efectivo esperado se recalcula con cada venta, compra y movimiento en efectivo. Al cerrar, cuentas el
              efectivo real y el sistema registra la diferencia.
            </p>
            <div className="space-y-3">
              <CuadroTotales etiquetaTotal="EFECTIVO ESPERADO" total={parseFloat(actual?.efectivoEsperado ?? "0")}>
                <FilaTotal etiqueta="Monto inicial" valor={parseFloat(sesion.montoInicial)} />
                <FilaTotal etiqueta="+ Ventas en efectivo" valor={parseFloat(actual?.componentes?.ventasEfectivo ?? "0")} />
                <FilaTotal etiqueta="+ Ingresos manuales" valor={parseFloat(actual?.componentes?.ingresosManuales ?? "0")} />
                <FilaTotal etiqueta="− Compras en efectivo" valor={parseFloat(actual?.componentes?.comprasEfectivo ?? "0")} />
                <FilaTotal etiqueta="− Egresos manuales" valor={parseFloat(actual?.componentes?.egresosManuales ?? "0")} />
              </CuadroTotales>
              <button
                onClick={() => setMostrarModalCierre(true)}
                className="w-full flex items-center justify-between bg-red-700 text-white px-4 py-3 rounded-sm text-sm font-semibold hover:bg-red-800"
              >
                <span>Cerrar caja</span>
                <span className="font-mono text-xs opacity-80">→</span>
              </button>
            </div>
          </div>
        </MarcoDocumento>
      )}

      {esAdmin && <CajasAbiertasAhora />}

      <SeccionListado
        titulo="Historial de caja"
        accion={
          esAdmin && (
            <select
              value={filtroSucursalId}
              onChange={(e) => {
                setFiltroSucursalId(e.target.value ? Number(e.target.value) : "");
                setPagina(1);
              }}
              className={`${CLASE_CAMPO} w-auto`}
            >
              <option value="">Todas las sucursales</option>
              {sucursales?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </select>
          )
        }
      >
        <table className="w-full text-sm">
          <thead className={CLASE_THEAD}>
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
                <td colSpan={esAdmin ? 9 : 8} className="px-4 py-4 text-center text-gray-400 dark:text-gray-500">
                  Cargando...
                </td>
              </tr>
            )}
            {!cargandoHistorial && historial?.length === 0 && (
              <tr>
                <td colSpan={esAdmin ? 9 : 8} className="px-4 py-4 text-center text-gray-400 dark:text-gray-500">
                  Todavía no hay sesiones de caja
                </td>
              </tr>
            )}
            {historial?.map((s) => (
              <tr key={s.id} className="border-t border-stone-100 dark:border-gray-700 hover:bg-stone-50 dark:hover:bg-gray-700/30">
                {esAdmin && <td className="px-4 py-2">{s.sucursal.nombre}</td>}
                <td className="px-4 py-2 text-gray-500 dark:text-gray-400">{s.puntoVenta?.nombre ?? "—"}</td>
                <td className="px-4 py-2 text-xs">
                  {s.abiertaPor.nombre}
                  <br />
                  <span className="font-mono text-gray-500 dark:text-gray-400">{new Date(s.abiertaEn).toLocaleString("es-EC")}</span>
                </td>
                <td className="px-4 py-2 text-xs">
                  {s.estado === "ABIERTA" ? (
                    <EstadoBadge estado="ABIERTA" />
                  ) : (
                    <>
                      {s.cerradaPor?.nombre}
                      <br />
                      <span className="font-mono text-gray-500 dark:text-gray-400">
                        {s.cerradaEn && new Date(s.cerradaEn).toLocaleString("es-EC")}
                      </span>
                    </>
                  )}
                </td>
                <td className="px-4 py-2 text-right font-mono tabular-nums">{s.montoInicial}</td>
                <td className="px-4 py-2 text-right font-mono tabular-nums">{s.montoEsperado ?? "—"}</td>
                <td className="px-4 py-2 text-right font-mono tabular-nums">{s.montoContado ?? "—"}</td>
                <td className={`px-4 py-2 text-right font-mono tabular-nums font-semibold ${colorDiferencia(s.diferencia)}`}>
                  {s.diferencia ?? "—"}
                </td>
                <td className="px-4 py-2 text-right">
                  <button
                    onClick={() => setSesionDetalleId(s.id)}
                    className="text-brand-700 dark:text-brand-300 hover:underline text-xs font-semibold"
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
      </SeccionListado>

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
