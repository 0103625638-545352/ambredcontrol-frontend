import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  api,
  type CuentaContable,
  type AsientoContable,
  type LibroMayor,
  type FilaBalanceComprobacion,
  type EstadoResultados,
  type BalanceGeneral,
} from "../api/client";
import { ReporteadorTabla, type ColumnaReporte } from "../components/ReporteadorTabla";
import { Modal } from "../components/Modal";
import { ModalCrearCuenta } from "../components/ModalCrearCuenta";
import { ModalCrearAsientoManual } from "../components/ModalCrearAsientoManual";
import { usePermiso } from "../context/AuthContext";
import { useConfirm } from "../components/ConfirmProvider";
import { useToast } from "../components/ToastProvider";
import { useFiltrosListado, BarraBuscadorDocumentos, filtrarLocal, sinPaginacion } from "../components/BuscadorDocumentos";
import { CLASE_CAMPO, CLASE_ETIQUETA, CLASE_THEAD, Resaltar } from "../components/FormatoDocumento";

type Pestana = "planCuentas" | "libroDiario" | "libroMayor" | "balanceComprobacion" | "balanceGeneral" | "estadoResultados";

const ORIGEN_ETIQUETAS: Record<string, string> = {
  FACTURA: "Factura",
  NOTA_VENTA: "Nota de venta",
  NOTA_CREDITO: "Nota de crédito",
  COMPRA: "Compra",
  DEVOLUCION_COMPRA: "Devolución a proveedor",
  PAGO: "Pago",
  MOVIMIENTO_CAJA: "Movimiento de caja",
  MANUAL: "Manual",
};

function sumar(lineas: AsientoContable["lineas"], campo: "debe" | "haber"): number {
  return lineas.reduce((acc, l) => acc + parseFloat(l[campo]), 0);
}

export function ContabilidadPage() {
  const puedeEditar = usePermiso("contabilidad_editar");
  const [pestanaActiva, setPestanaActiva] = useState<Pestana>("planCuentas");
  const [mostrarModalCuenta, setMostrarModalCuenta] = useState(false);
  const [mostrarModalAsiento, setMostrarModalAsiento] = useState(false);
  const [asientoDetalle, setAsientoDetalle] = useState<AsientoContable | null>(null);

  const pestanas: { id: Pestana; etiqueta: string }[] = [
    { id: "planCuentas", etiqueta: "Plan de Cuentas" },
    { id: "libroDiario", etiqueta: "Libro Diario" },
    { id: "libroMayor", etiqueta: "Libro Mayor" },
    { id: "balanceComprobacion", etiqueta: "Balance de Comprobación" },
    { id: "balanceGeneral", etiqueta: "Balance General" },
    { id: "estadoResultados", etiqueta: "Estado de Resultados" },
  ];

  const columnasAsientos: ColumnaReporte<AsientoContable>[] = [
    { clave: "numero", etiqueta: "Número", obtenerValor: (a) => a.numero },
    { clave: "fecha", etiqueta: "Fecha", formato: "fecha", obtenerValor: (a) => a.fecha },
    { clave: "descripcion", etiqueta: "Descripción", obtenerValor: (a) => a.descripcion },
    { clave: "origen", etiqueta: "Origen", obtenerValor: (a) => ORIGEN_ETIQUETAS[a.origen] ?? a.origen },
    { clave: "total", etiqueta: "Total", formato: "moneda", obtenerValor: (a) => sumar(a.lineas, "debe") },
  ];

  return (
    <div className="bg-white dark:bg-gray-800 border border-stone-300 dark:border-gray-700">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-stone-300 dark:border-gray-700">
        <h2 className="text-base font-bold text-gray-900 dark:text-gray-50">Contabilidad</h2>
        <span className="font-mono text-[11px] text-gray-400 dark:text-gray-500">
          {pestanas.find((p) => p.id === pestanaActiva)?.etiqueta}
        </span>
      </div>
      <div className="px-4 py-2 bg-stone-50 dark:bg-gray-900/40 border-b border-stone-200 dark:border-gray-700">
        <div>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Plan de cuentas y libro diario de partida doble. Ventas, compras, pagos y movimientos de caja generan su
            asiento automáticamente; usa "Nuevo asiento manual" para todo lo demás (arriendo, sueldos, ajustes).
          </p>
        </div>
      </div>

      {puedeEditar && <PanelCierreContable />}

      <div className="flex flex-wrap border-b border-stone-300 dark:border-gray-700 px-2">
        {pestanas.map((p) => (
          <button
            key={p.id}
            onClick={() => setPestanaActiva(p.id)}
            className={`px-3.5 py-2.5 text-sm font-medium border-b-2 -mb-px ${
              pestanaActiva === p.id
                ? "border-brand-600 text-brand-700 dark:text-brand-300"
                : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
            }`}
          >
            {p.etiqueta}
          </button>
        ))}
      </div>

      <div className="p-4">

      {pestanaActiva === "planCuentas" && (
        <PestanaPlanCuentas puedeEditar={puedeEditar} onNuevaCuenta={() => setMostrarModalCuenta(true)} />
      )}

      {pestanaActiva === "libroDiario" && (
        <div>
          {puedeEditar && (
            <div className="flex justify-end mb-2">
              <button
                onClick={() => setMostrarModalAsiento(true)}
                className="border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 px-3 py-1.5 rounded-sm text-sm font-semibold hover:bg-stone-50 dark:hover:bg-gray-700"
              >
                + Nuevo asiento manual
              </button>
            </div>
          )}
          <ReporteadorTabla
            endpoint="/contabilidad/libro-diario"
            columnas={columnasAsientos}
            nombreArchivo="libro-diario"
            filaId={(a) => a.id}
            onVerDetalle={(a: AsientoContable) => setAsientoDetalle(a)}
            campoMonto={(a) => sumar(a.lineas, "debe")}
            campoFechaGrafico={(a) => a.fecha}
          />
        </div>
      )}

      {pestanaActiva === "libroMayor" && <PestanaLibroMayor />}

      {pestanaActiva === "balanceComprobacion" && <PestanaBalanceComprobacion />}

      {pestanaActiva === "balanceGeneral" && <PestanaBalanceGeneral />}

      {pestanaActiva === "estadoResultados" && <PestanaEstadoResultados />}
      </div>

      {mostrarModalCuenta && <ModalCrearCuenta onCerrar={() => setMostrarModalCuenta(false)} />}
      {mostrarModalAsiento && <ModalCrearAsientoManual onCerrar={() => setMostrarModalAsiento(false)} />}

      {asientoDetalle && (
        <Modal titulo={`Asiento ${asientoDetalle.numero}`} onCerrar={() => setAsientoDetalle(null)}>
          <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">{asientoDetalle.descripcion}</p>
          <table className="w-full text-sm">
            <thead className={CLASE_THEAD}>
              <tr>
                <th className="px-2 py-1.5">Cuenta</th>
                <th className="px-2 py-1.5 text-right">Debe</th>
                <th className="px-2 py-1.5 text-right">Haber</th>
              </tr>
            </thead>
            <tbody>
              {asientoDetalle.lineas.map((l) => (
                <tr key={l.id} className="border-t border-stone-100 dark:border-gray-700">
                  <td className="px-2 py-1.5">
                    <span className="font-mono text-xs text-gray-500 dark:text-gray-400">{l.cuenta.codigo}</span> {l.cuenta.nombre}
                    {l.glosa && <span className="block text-xs text-gray-400 dark:text-gray-500">{l.glosa}</span>}
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono tabular-nums">{parseFloat(l.debe) > 0 ? parseFloat(l.debe).toFixed(2) : "—"}</td>
                  <td className="px-2 py-1.5 text-right font-mono tabular-nums">{parseFloat(l.haber) > 0 ? parseFloat(l.haber).toFixed(2) : "—"}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-gray-900 dark:border-gray-200 font-bold text-gray-900 dark:text-gray-50">
                <td className="px-2 py-2">TOTAL USD</td>
                <td className="px-2 py-2 text-right font-mono tabular-nums">{sumar(asientoDetalle.lineas, "debe").toFixed(2)}</td>
                <td className="px-2 py-2 text-right font-mono tabular-nums">{sumar(asientoDetalle.lineas, "haber").toFixed(2)}</td>
              </tr>
            </tfoot>
          </table>
          {asientoDetalle.asientoRevertidoId && (
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-3">Este asiento es la reversión de otro.</p>
          )}
        </Modal>
      )}
    </div>
  );
}

// Panel de cierre contable: solo visible con "contabilidad_editar" (ver
// ContabilidadPage). Ningún asiento (automático o manual) puede postearse
// en o antes de esta fecha (ver utils/asientos.ts en el backend).
function PanelCierreContable() {
  const queryClient = useQueryClient();
  const confirmar = useConfirm();
  const { mostrarToast } = useToast();
  const [fecha, setFecha] = useState("");

  const { data } = useQuery({
    queryKey: ["contabilidad", "cierre"],
    queryFn: async () => (await api.get<{ cierreContableHasta: string | null }>("/contabilidad/cierre")).data,
  });

  const actualizarCierre = useMutation({
    mutationFn: async (nuevaFecha: string | null) => api.patch("/contabilidad/cierre", { cierreContableHasta: nuevaFecha }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contabilidad", "cierre"] });
      mostrarToast("Cierre contable actualizado", "success");
      setFecha("");
    },
    onError: (error: any) => mostrarToast(error.response?.data?.error ?? "Error al actualizar el cierre contable"),
  });

  async function confirmarActualizar() {
    const ok = await confirmar(
      `¿Cerrar el período contable hasta el ${fecha}? Nadie va a poder crear asientos con fecha en o antes de ese día.`
    );
    if (ok) actualizarCierre.mutate(fecha);
  }

  async function confirmarQuitar() {
    const ok = await confirmar("¿Quitar el cierre contable? Se podrá volver a postear en cualquier fecha.");
    if (ok) actualizarCierre.mutate(null);
  }

  return (
    <div className="px-4 py-2.5 border-b border-stone-300 dark:border-gray-700 flex flex-wrap items-end gap-3">
      <div>
        <p className="font-mono text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1">Cierre contable</p>
        <p className="text-sm font-medium text-gray-800 dark:text-gray-100">
          {data?.cierreContableHasta ? `Cerrado hasta ${data.cierreContableHasta}` : "Sin cerrar"}
        </p>
      </div>
      <input
        type="date"
        value={fecha}
        onChange={(e) => setFecha(e.target.value)}
        className="border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-3 py-1.5 text-sm"
      />
      <button
        onClick={confirmarActualizar}
        disabled={!fecha || actualizarCierre.isPending}
        className="bg-amber-600 text-white px-3 py-1.5 rounded-sm text-xs font-medium hover:bg-amber-700 disabled:opacity-40"
      >
        Actualizar cierre
      </button>
      {data?.cierreContableHasta && (
        <button
          onClick={confirmarQuitar}
          disabled={actualizarCierre.isPending}
          className="text-red-600 dark:text-red-400 hover:underline text-xs font-medium"
        >
          Quitar cierre
        </button>
      )}
    </div>
  );
}

function PestanaPlanCuentas({ puedeEditar, onNuevaCuenta }: { puedeEditar: boolean; onNuevaCuenta: () => void }) {
  const queryClient = useQueryClient();
  const confirmar = useConfirm();
  const { mostrarToast } = useToast();
  const { data: cuentas, isLoading } = useQuery({
    queryKey: ["contabilidad", "plan-cuentas"],
    queryFn: async () => (await api.get<CuentaContable[]>("/contabilidad/plan-cuentas")).data,
  });

  const [cuentaEditandoId, setCuentaEditandoId] = useState<number | null>(null);
  const [nombreEdicion, setNombreEdicion] = useState("");

  const editarCuenta = useMutation({
    mutationFn: async ({ id, nombre, activa }: { id: number; nombre?: string; activa?: boolean }) =>
      api.patch(`/contabilidad/plan-cuentas/${id}`, { nombre, activa }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contabilidad", "plan-cuentas"] });
      setCuentaEditandoId(null);
    },
    onError: (error: any) => mostrarToast(error.response?.data?.error ?? "Error al editar la cuenta"),
  });

  function abrirEdicion(c: CuentaContable) {
    setNombreEdicion(c.nombre);
    setCuentaEditandoId(cuentaEditandoId === c.id ? null : c.id);
  }

  async function confirmarDesactivar(c: CuentaContable) {
    const ok = await confirmar(`¿Desactivar la cuenta "${c.codigo} - ${c.nombre}"?`);
    if (ok) editarCuenta.mutate({ id: c.id, activa: false });
  }

  // Buscador compartido de los listados (en el navegador: el plan de
  // cuentas ya viene completo), con filtro por tipo de cuenta.
  const filtros = useFiltrosListado(sinPaginacion);
  const cuentasFiltradas = filtrarLocal(cuentas, filtros, {
    textos: (c) => [c.codigo, c.nombre],
    estado: (c) => (c.activa ? "ACTIVA" : "INACTIVA"),
    extra: (c, extra) => !extra.tipo || c.tipo === extra.tipo,
  });

  return (
    <div>
      {puedeEditar && (
        <div className="flex justify-end mb-2">
          <button
            onClick={onNuevaCuenta}
            className="border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 px-3 py-1.5 rounded-sm text-sm font-semibold hover:bg-stone-50 dark:hover:bg-gray-700"
          >
            + Nueva cuenta
          </button>
        </div>
      )}
      <div className="bg-white dark:bg-gray-800 rounded-sm border border-stone-300 dark:border-gray-700 overflow-x-auto">
        <BarraBuscadorDocumentos
          filtros={filtros}
          etiquetaBusqueda="Buscar · código o nombre de la cuenta"
          placeholder="Ej: 1.1.01, Caja, Ventas..."
          opcionesEstado={[
            { valor: "ACTIVA", etiqueta: "Activa" },
            { valor: "INACTIVA", etiqueta: "Inactiva" },
          ]}
          mostrarPago={false}
          mostrarFechas={false}
          extras={
            <label className="flex flex-col gap-1 w-36">
              <span className={CLASE_ETIQUETA}>Tipo</span>
              <select value={filtros.extra.tipo ?? ""} onChange={(e) => filtros.setExtra("tipo", e.target.value)} className={CLASE_CAMPO}>
                <option value="">Todos</option>
                {["ACTIVO", "PASIVO", "PATRIMONIO", "INGRESO", "COSTO", "GASTO"].map((t) => (
                  <option key={t} value={t}>
                    {t.charAt(0) + t.slice(1).toLowerCase()}
                  </option>
                ))}
              </select>
            </label>
          }
        />
        <table className="w-full text-sm">
          <thead className="bg-stone-100 dark:bg-gray-900/60 border-b border-stone-300 dark:border-gray-700 text-left font-mono text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 [&_th]:font-medium">
            <tr>
              <th className="px-4 py-2">Código</th>
              <th className="px-4 py-2">Nombre</th>
              <th className="px-4 py-2">Tipo</th>
              <th className="px-4 py-2">Naturaleza</th>
              <th className="px-4 py-2">Estado</th>
              {puedeEditar && <th className="px-4 py-2"></th>}
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={puedeEditar ? 6 : 5} className="px-4 py-4 text-center text-gray-400 dark:text-gray-500">Cargando...</td>
              </tr>
            )}
            {(cuentasFiltradas ?? []).map((c) =>
              cuentaEditandoId === c.id ? (
                <tr key={c.id} className="border-t border-stone-100 dark:border-gray-700">
                  <td colSpan={puedeEditar ? 6 : 5} className="px-4 py-2">
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        editarCuenta.mutate({ id: c.id, nombre: nombreEdicion });
                      }}
                      className="flex items-center gap-2"
                    >
                      <span className="font-mono text-xs text-gray-500 dark:text-gray-400">{c.codigo}</span>
                      <input
                        autoFocus
                        required
                        value={nombreEdicion}
                        onChange={(e) => setNombreEdicion(e.target.value)}
                        className="flex-1 border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-2 py-1 text-sm"
                      />
                      <span className="text-xs text-gray-400 dark:text-gray-500">
                        {c.tipo} · {c.naturaleza === "DEUDORA" ? "Deudora" : "Acreedora"}
                      </span>
                      <button
                        type="submit"
                        disabled={editarCuenta.isPending}
                        className="bg-brand-700 text-white px-3 py-1 rounded-sm text-xs font-semibold hover:bg-brand-800 disabled:opacity-50"
                      >
                        Guardar
                      </button>
                      <button
                        type="button"
                        onClick={() => setCuentaEditandoId(null)}
                        className="bg-stone-200 dark:bg-gray-600 text-gray-800 dark:text-gray-100 px-3 py-1 rounded-sm text-xs font-medium hover:bg-gray-300 dark:hover:bg-gray-500"
                      >
                        Cancelar
                      </button>
                    </form>
                  </td>
                </tr>
              ) : (
                <tr key={c.id} className="border-t border-stone-100 dark:border-gray-700">
                  <td className="px-4 py-2 font-mono text-xs"><Resaltar texto={c.codigo} termino={filtros.busquedaAplicada} /></td>
                  <td className="px-4 py-2"><Resaltar texto={c.nombre} termino={filtros.busquedaAplicada} /></td>
                  <td className="px-4 py-2 font-mono text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400">{c.tipo}</td>
                  <td className="px-4 py-2 font-mono text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400">{c.naturaleza === "DEUDORA" ? "Deudora" : "Acreedora"}</td>
                  <td className="px-4 py-2">
                    {c.activa ? (
                      <span className="text-emerald-600 dark:text-emerald-400 text-xs">Activa</span>
                    ) : (
                      <span className="text-gray-400 dark:text-gray-500 text-xs">Inactiva</span>
                    )}
                  </td>
                  {puedeEditar && (
                    <td className="px-4 py-2 text-right space-x-3">
                      <button
                        onClick={() => abrirEdicion(c)}
                        className="text-brand-700 dark:text-brand-300 hover:underline text-xs font-medium"
                      >
                        Editar
                      </button>
                      {c.activa && (
                        <button
                          onClick={() => confirmarDesactivar(c)}
                          className="text-red-600 dark:text-red-400 hover:underline text-xs font-medium"
                        >
                          Desactivar
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              )
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PestanaLibroMayor() {
  const { data: cuentas } = useQuery({
    queryKey: ["contabilidad", "plan-cuentas"],
    queryFn: async () => (await api.get<CuentaContable[]>("/contabilidad/plan-cuentas")).data,
  });
  const [cuentaId, setCuentaId] = useState<number | "">("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");

  const { data: libroMayor, isLoading } = useQuery({
    queryKey: ["contabilidad", "libro-mayor", cuentaId, desde, hasta],
    queryFn: async () =>
      (
        await api.get<LibroMayor>(`/contabilidad/libro-mayor/${cuentaId}`, {
          params: { desde: desde || undefined, hasta: hasta || undefined },
        })
      ).data,
    enabled: cuentaId !== "",
  });

  return (
    <div>
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div>
          <label className="block font-mono text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1">Cuenta</label>
          <select
            value={cuentaId}
            onChange={(e) => setCuentaId(e.target.value ? Number(e.target.value) : "")}
            className="border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-3 py-1.5 text-sm"
          >
            <option value="">Selecciona una cuenta...</option>
            {(cuentas ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.codigo} - {c.nombre}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block font-mono text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1">Desde</label>
          <input
            type="date"
            value={desde}
            onChange={(e) => setDesde(e.target.value)}
            className="border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-3 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="block font-mono text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1">Hasta</label>
          <input
            type="date"
            value={hasta}
            onChange={(e) => setHasta(e.target.value)}
            className="border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-3 py-1.5 text-sm"
          />
        </div>
      </div>

      {cuentaId === "" && <p className="text-sm text-gray-400 dark:text-gray-500">Selecciona una cuenta para ver su libro mayor.</p>}

      {cuentaId !== "" && (
        <div className="bg-white dark:bg-gray-800 rounded-sm border border-stone-300 dark:border-gray-700 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-stone-100 dark:bg-gray-900/60 border-b border-stone-300 dark:border-gray-700 text-left font-mono text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 [&_th]:font-medium">
              <tr>
                <th className="px-4 py-2">Fecha</th>
                <th className="px-4 py-2">Asiento</th>
                <th className="px-4 py-2">Glosa</th>
                <th className="px-4 py-2 text-right">Debe</th>
                <th className="px-4 py-2 text-right">Haber</th>
                <th className="px-4 py-2 text-right">Saldo</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={6} className="px-4 py-4 text-center text-gray-400 dark:text-gray-500">Cargando...</td>
                </tr>
              )}
              {libroMayor && (
                <tr className="border-t border-stone-100 dark:border-gray-700 bg-stone-50 dark:bg-gray-900/30">
                  <td colSpan={5} className="px-4 py-2 text-xs text-gray-500 dark:text-gray-400">Saldo inicial</td>
                  <td className="px-4 py-2 text-right font-medium">${libroMayor.saldoInicial}</td>
                </tr>
              )}
              {libroMayor?.movimientos.map((m) => (
                <tr key={m.id} className="border-t border-stone-100 dark:border-gray-700">
                  <td className="px-4 py-2">{new Date(m.asiento.fecha).toLocaleDateString("es-EC")}</td>
                  <td className="px-4 py-2 font-mono text-xs">{m.asiento.numero}</td>
                  <td className="px-4 py-2 text-xs text-gray-500 dark:text-gray-400">{m.glosa || m.asiento.descripcion}</td>
                  <td className="px-4 py-2 text-right">{parseFloat(m.debe) > 0 ? `$${parseFloat(m.debe).toFixed(2)}` : "—"}</td>
                  <td className="px-4 py-2 text-right">{parseFloat(m.haber) > 0 ? `$${parseFloat(m.haber).toFixed(2)}` : "—"}</td>
                  <td className="px-4 py-2 text-right font-medium">${m.saldoAcumulado}</td>
                </tr>
              ))}
              {libroMayor && libroMayor.movimientos.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-4 text-center text-gray-400 dark:text-gray-500">Sin movimientos en este rango</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function PestanaBalanceComprobacion() {
  const [hasta, setHasta] = useState("");

  const { data: filas, isLoading } = useQuery({
    queryKey: ["contabilidad", "balance-comprobacion", hasta],
    queryFn: async () =>
      (await api.get<FilaBalanceComprobacion[]>("/contabilidad/balance-comprobacion", { params: { hasta: hasta || undefined } })).data,
  });

  const totalDebe = (filas ?? []).reduce((acc, f) => acc + parseFloat(f.totalDebe), 0);
  const totalHaber = (filas ?? []).reduce((acc, f) => acc + parseFloat(f.totalHaber), 0);

  return (
    <div>
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div>
          <label className="block font-mono text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1">Hasta</label>
          <input
            type="date"
            value={hasta}
            onChange={(e) => setHasta(e.target.value)}
            className="border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-3 py-1.5 text-sm"
          />
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-sm border border-stone-300 dark:border-gray-700 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-stone-100 dark:bg-gray-900/60 border-b border-stone-300 dark:border-gray-700 text-left font-mono text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 [&_th]:font-medium">
            <tr>
              <th className="px-4 py-2">Cuenta</th>
              <th className="px-4 py-2 text-right">Total Debe</th>
              <th className="px-4 py-2 text-right">Total Haber</th>
              <th className="px-4 py-2 text-right">Saldo</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={4} className="px-4 py-4 text-center text-gray-400 dark:text-gray-500">Cargando...</td>
              </tr>
            )}
            {(filas ?? [])
              .filter((f) => parseFloat(f.totalDebe) > 0 || parseFloat(f.totalHaber) > 0)
              .map((f) => (
                <tr key={f.cuenta.id} className="border-t border-stone-100 dark:border-gray-700">
                  <td className="px-4 py-2">
                    <span className="font-mono text-xs text-gray-500 dark:text-gray-400 mr-2">{f.cuenta.codigo}</span>
                    {f.cuenta.nombre}
                  </td>
                  <td className="px-4 py-2 text-right font-mono tabular-nums">${f.totalDebe}</td>
                  <td className="px-4 py-2 text-right font-mono tabular-nums">${f.totalHaber}</td>
                  <td className="px-4 py-2 text-right font-medium">${f.saldo}</td>
                </tr>
              ))}
          </tbody>
          {filas && (
            <tfoot>
              <tr className="border-t-2 border-stone-300 dark:border-gray-600 font-semibold">
                <td className="px-4 py-2">Total</td>
                <td className="px-4 py-2 text-right font-mono tabular-nums">${totalDebe.toFixed(2)}</td>
                <td className="px-4 py-2 text-right font-mono tabular-nums">${totalHaber.toFixed(2)}</td>
                <td className="px-4 py-2 text-right">{Math.abs(totalDebe - totalHaber) < 0.005 ? "Cuadrado" : "Descuadrado"}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

function TablaSeccion({ titulo, filas }: { titulo: string; filas: { cuenta: CuentaContable; saldo: string }[] }) {
  const total = filas.reduce((acc, f) => acc + parseFloat(f.saldo), 0);
  return (
    <div className="bg-white dark:bg-gray-800 rounded-sm border border-stone-300 dark:border-gray-700 overflow-hidden">
      <div className="px-4 py-2 border-b border-stone-100 dark:border-gray-700">
        <h3 className="font-mono text-[11px] uppercase tracking-[0.15em] text-gray-600 dark:text-gray-300">{titulo}</h3>
      </div>
      <table className="w-full text-sm">
        <tbody>
          {filas.length === 0 && (
            <tr>
              <td className="px-4 py-3 text-center text-gray-400 dark:text-gray-500 text-xs">Sin cuentas con movimiento</td>
            </tr>
          )}
          {filas.map((f) => (
            <tr key={f.cuenta.id} className="border-t border-stone-100 dark:border-gray-700">
              <td className="px-4 py-2">
                <span className="font-mono text-xs text-gray-500 dark:text-gray-400 mr-2">{f.cuenta.codigo}</span>
                {f.cuenta.nombre}
              </td>
              <td className="px-4 py-2 text-right font-mono tabular-nums">${f.saldo}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-stone-300 dark:border-gray-600 font-semibold">
            <td className="px-4 py-2">Total {titulo}</td>
            <td className="px-4 py-2 text-right font-mono tabular-nums">${total.toFixed(2)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// Activo/Pasivo/Patrimonio a una fecha, más la "Utilidad del ejercicio"
// calculada al vuelo (ver backend) — el sistema no tiene un asiento de
// cierre de período, así que este total siempre debe dar "Cuadrado" porque
// todo asiento ya cuadra por diseño (ver validarAsientoCuadrado).
function PestanaBalanceGeneral() {
  const [hasta, setHasta] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["contabilidad", "balance-general", hasta],
    queryFn: async () => (await api.get<BalanceGeneral>("/contabilidad/balance-general", { params: { hasta: hasta || undefined } })).data,
  });

  return (
    <div>
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div>
          <label className="block font-mono text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1">Hasta</label>
          <input
            type="date"
            value={hasta}
            onChange={(e) => setHasta(e.target.value)}
            className="border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-3 py-1.5 text-sm"
          />
        </div>
      </div>

      {isLoading && <p className="text-sm text-gray-400 dark:text-gray-500">Cargando...</p>}

      {data && (
        <div className="space-y-4">
          <TablaSeccion titulo="Activo" filas={data.activos} />
          <TablaSeccion titulo="Pasivo" filas={data.pasivos} />
          <TablaSeccion
            titulo="Patrimonio"
            filas={[...data.patrimonio, { cuenta: { id: -1, codigo: "", nombre: "Utilidad del ejercicio", tipo: "PATRIMONIO", naturaleza: "ACREEDORA", cuentaPadreId: null, permiteMovimiento: false, activa: true, createdAt: "" }, saldo: data.utilidadEjercicio }]}
          />

          <div className="bg-white dark:bg-gray-800 rounded-sm border border-stone-300 dark:border-gray-700 p-4 flex justify-between items-center">
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">Activo: ${data.totales.activo}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Pasivo + Patrimonio: ${data.totales.pasivoMasPatrimonio}</p>
            </div>
            <span
              className={`px-3 py-0.5 rounded-sm font-mono text-[10px] uppercase tracking-wider font-semibold ${
                data.totales.cuadrado
                  ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300"
                  : "bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300"
              }`}
            >
              {data.totales.cuadrado ? "Cuadrado" : "Descuadrado"}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// Ingresos - Costos - Gastos del período elegido.
function PestanaEstadoResultados() {
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["contabilidad", "estado-resultados", desde, hasta],
    queryFn: async () =>
      (
        await api.get<EstadoResultados>("/contabilidad/estado-resultados", {
          params: { desde: desde || undefined, hasta: hasta || undefined },
        })
      ).data,
  });

  return (
    <div>
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div>
          <label className="block font-mono text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1">Desde</label>
          <input
            type="date"
            value={desde}
            onChange={(e) => setDesde(e.target.value)}
            className="border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-3 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="block font-mono text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1">Hasta</label>
          <input
            type="date"
            value={hasta}
            onChange={(e) => setHasta(e.target.value)}
            className="border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-3 py-1.5 text-sm"
          />
        </div>
      </div>

      {isLoading && <p className="text-sm text-gray-400 dark:text-gray-500">Cargando...</p>}

      {data && (
        <div className="space-y-4">
          <TablaSeccion titulo="Ingresos" filas={data.ingresos} />
          <TablaSeccion titulo="Costos" filas={data.costos} />
          <TablaSeccion titulo="Gastos" filas={data.gastos} />

          <div className="bg-white dark:bg-gray-800 rounded-sm border border-stone-300 dark:border-gray-700 p-4 grid grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Ingresos</p>
              <p className="text-lg font-bold text-gray-800 dark:text-gray-100">${data.resumen.totalIngresos}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Costos</p>
              <p className="text-lg font-bold text-gray-800 dark:text-gray-100">${data.resumen.totalCostos}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Gastos</p>
              <p className="text-lg font-bold text-gray-800 dark:text-gray-100">${data.resumen.totalGastos}</p>
            </div>
            <div className={parseFloat(data.resumen.utilidadNeta) >= 0 ? "bg-emerald-600 rounded-sm p-2 -m-2" : "bg-red-600 rounded-sm p-2 -m-2"}>
              <p className="text-xs text-white/80 mb-1">Utilidad neta</p>
              <p className="text-lg font-bold text-white">${data.resumen.utilidadNeta}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
