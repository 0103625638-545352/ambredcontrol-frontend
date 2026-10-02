import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type CuentaBancaria } from "../api/client";
import { useConfirm } from "../components/ConfirmProvider";
import { useToast } from "../components/ToastProvider";
import { useFiltrosListado, BarraBuscadorDocumentos, filtrarLocal, sinPaginacion } from "../components/BuscadorDocumentos";
import {
  CLASE_CAMPO,
  CLASE_ETIQUETA,
  CLASE_THEAD,
  CLASE_CAMPO_CELDA,
  CLASE_ACCION,
  CLASE_ACCION_PELIGRO,
  PanelListado,
  FilaSinResultados,
  Resaltar,
} from "../components/FormatoDocumento";

const TIPOS_CUENTA = ["AHORROS", "CORRIENTE"];

// Catálogo de cuentas bancarias de la empresa (global, no por sucursal) — se
// elige al registrar un Pago con formaPago TRANSFERENCIA/TARJETA/CHEQUE (ver
// ModalRegistrarPago.tsx y PuntoDeVentaPage.tsx), para poder conciliar el
// dinero real contra lo registrado en el sistema. Mirror de
// TiposPrecioPage.tsx, con más campos por fila. Solo ADMIN puede crear/
// editar/desactivar.
export function CuentasBancariasPage() {
  const queryClient = useQueryClient();
  const confirmar = useConfirm();
  const { mostrarToast } = useToast();
  const FORM_VACIO = { nombre: "", banco: "", numeroCuenta: "", tipoCuenta: "AHORROS" };
  const [formNuevo, setFormNuevo] = useState(FORM_VACIO);
  const [cuentaEditandoId, setCuentaEditandoId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState(FORM_VACIO);

  const { data: cuentasBancarias, isLoading } = useQuery({
    queryKey: ["cuentas-bancarias"],
    queryFn: async () => (await api.get<CuentaBancaria[]>("/cuentas-bancarias")).data,
  });

  const crearCuentaBancaria = useMutation({
    mutationFn: async () => api.post("/cuentas-bancarias", formNuevo),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cuentas-bancarias"] });
      setFormNuevo(FORM_VACIO);
    },
    onError: (error: any) => {
      mostrarToast(error.response?.data?.error ?? "Error al crear la cuenta bancaria");
    },
  });

  const editarCuentaBancaria = useMutation({
    mutationFn: async (id: number) => api.put(`/cuentas-bancarias/${id}`, editForm),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cuentas-bancarias"] });
      setCuentaEditandoId(null);
    },
    onError: (error: any) => {
      mostrarToast(error.response?.data?.error ?? "Error al editar la cuenta bancaria");
    },
  });

  const desactivarCuentaBancaria = useMutation({
    mutationFn: async (id: number) => api.delete(`/cuentas-bancarias/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cuentas-bancarias"] });
    },
    onError: (error: any) => {
      mostrarToast(error.response?.data?.error ?? "Error al desactivar la cuenta bancaria");
    },
  });

  function abrirEdicion(cb: CuentaBancaria) {
    setEditForm({ nombre: cb.nombre, banco: cb.banco, numeroCuenta: cb.numeroCuenta, tipoCuenta: cb.tipoCuenta });
    setCuentaEditandoId(cuentaEditandoId === cb.id ? null : cb.id);
  }

  async function confirmarDesactivar(cb: CuentaBancaria) {
    const ok = await confirmar(`¿Desactivar "${cb.nombre}"? Los pagos ya registrados con esta cuenta la conservan.`);
    if (ok) desactivarCuentaBancaria.mutate(cb.id);
  }

  // Buscador del catálogo (en el navegador: la lista ya viene completa).
  const filtros = useFiltrosListado(sinPaginacion);
  const cuentasFiltradas = filtrarLocal(cuentasBancarias, filtros, {
    textos: (cb) => [cb.nombre, cb.banco, cb.numeroCuenta],
    fecha: (cb) => cb.createdAt,
    estado: (cb) => cb.tipoCuenta,
  });

  return (
    <div>
      <PanelListado
        titulo="Cuentas bancarias"
        conteo={cuentasBancarias?.length}
        singular="cuenta"
        plural="cuentas"
        aviso="Cuentas PROPIAS de la empresa. Se elige a cuál llegó el dinero al registrar un cobro por transferencia, tarjeta o cheque."
      >
        {/* Línea de ingreso: nueva cuenta */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            crearCuentaBancaria.mutate();
          }}
          className="flex flex-wrap items-end gap-2 p-3 border-b border-stone-300 dark:border-gray-700"
        >
          <label className="flex flex-col gap-1 flex-[2_1_220px] min-w-0">
            <span className={CLASE_ETIQUETA}>Nombre de la cuenta</span>
            <input
              placeholder="Ej: Pichincha Corriente Principal"
              required
              value={formNuevo.nombre}
              onChange={(e) => setFormNuevo({ ...formNuevo, nombre: e.target.value })}
              className={CLASE_CAMPO}
            />
          </label>
          <label className="flex flex-col gap-1 flex-[1_1_150px] min-w-0">
            <span className={CLASE_ETIQUETA}>Banco</span>
            <input
              placeholder="Banco"
              required
              value={formNuevo.banco}
              onChange={(e) => setFormNuevo({ ...formNuevo, banco: e.target.value })}
              className={CLASE_CAMPO}
            />
          </label>
          <label className="flex flex-col gap-1 flex-[1_1_150px] min-w-0">
            <span className={CLASE_ETIQUETA}>N° de cuenta</span>
            <input
              placeholder="Número de cuenta"
              required
              value={formNuevo.numeroCuenta}
              onChange={(e) => setFormNuevo({ ...formNuevo, numeroCuenta: e.target.value })}
              className={`${CLASE_CAMPO} font-mono`}
            />
          </label>
          <label className="flex flex-col gap-1 w-32">
            <span className={CLASE_ETIQUETA}>Tipo</span>
            <select
              value={formNuevo.tipoCuenta}
              onChange={(e) => setFormNuevo({ ...formNuevo, tipoCuenta: e.target.value })}
              className={CLASE_CAMPO}
            >
              {TIPOS_CUENTA.map((tipo) => (
                <option key={tipo} value={tipo}>
                  {tipo === "AHORROS" ? "Ahorros" : "Corriente"}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            disabled={crearCuentaBancaria.isPending}
            className="bg-brand-700 text-white px-4 py-1.5 rounded-sm text-sm font-semibold hover:bg-brand-800 disabled:opacity-50 whitespace-nowrap"
          >
            {crearCuentaBancaria.isPending ? "Guardando..." : "Agregar ↵"}
          </button>
        </form>

        <BarraBuscadorDocumentos
          filtros={filtros}
          etiquetaBusqueda="Buscar · nombre, banco o n° de cuenta"
          placeholder="Ej: Pichincha, 2200..."
          etiquetaEstado="Tipo"
          opcionesEstado={[
            { valor: "AHORROS", etiqueta: "Ahorros" },
            { valor: "CORRIENTE", etiqueta: "Corriente" },
          ]}
          mostrarPago={false}
        />

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className={CLASE_THEAD}>
              <tr>
                <th className="px-4 py-2 w-10">#</th>
                <th className="px-4 py-2">Nombre</th>
                <th className="px-4 py-2">Banco</th>
                <th className="px-4 py-2">N° de cuenta</th>
                <th className="px-4 py-2">Tipo</th>
                <th className="px-4 py-2 w-40"></th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-gray-400 dark:text-gray-500">
                    Cargando...
                  </td>
                </tr>
              )}
              {!isLoading && cuentasFiltradas?.length === 0 && (
                <FilaSinResultados columnas={6} hayFiltros={filtros.hayFiltros} vacio="Todavía no hay cuentas bancarias." />
              )}
              {cuentasFiltradas?.map((cb, indice) => (
                <tr key={cb.id} className="border-t border-stone-100 dark:border-gray-700 hover:bg-stone-50 dark:hover:bg-gray-700/30">
                  {cuentaEditandoId === cb.id ? (
                    <td colSpan={6} className="px-4 py-2">
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          editarCuentaBancaria.mutate(cb.id);
                        }}
                        className="flex flex-wrap gap-2"
                      >
                        <input
                          autoFocus
                          required
                          value={editForm.nombre}
                          onChange={(e) => setEditForm({ ...editForm, nombre: e.target.value })}
                          onKeyDown={(e) => {
                            if (e.key === "Escape") setCuentaEditandoId(null);
                          }}
                          className={`${CLASE_CAMPO_CELDA} flex-1 min-w-40 text-left font-sans`}
                        />
                        <input
                          required
                          value={editForm.banco}
                          onChange={(e) => setEditForm({ ...editForm, banco: e.target.value })}
                          className={`${CLASE_CAMPO_CELDA} w-36 text-left font-sans`}
                        />
                        <input
                          required
                          value={editForm.numeroCuenta}
                          onChange={(e) => setEditForm({ ...editForm, numeroCuenta: e.target.value })}
                          className={`${CLASE_CAMPO_CELDA} w-36 text-left`}
                        />
                        <select
                          value={editForm.tipoCuenta}
                          onChange={(e) => setEditForm({ ...editForm, tipoCuenta: e.target.value })}
                          className={`${CLASE_CAMPO_CELDA} w-28 text-left font-sans`}
                        >
                          {TIPOS_CUENTA.map((tipo) => (
                            <option key={tipo} value={tipo}>
                              {tipo === "AHORROS" ? "Ahorros" : "Corriente"}
                            </option>
                          ))}
                        </select>
                        <button
                          type="submit"
                          disabled={editarCuentaBancaria.isPending}
                          className="bg-brand-700 text-white px-3 py-1 rounded-sm text-xs font-semibold hover:bg-brand-800 disabled:opacity-50"
                        >
                          Guardar
                        </button>
                        <button type="button" onClick={() => setCuentaEditandoId(null)} className={CLASE_ACCION}>
                          Cancelar
                        </button>
                      </form>
                    </td>
                  ) : (
                    <>
                      <td className="px-4 py-2 font-mono text-xs text-gray-400">{indice + 1}</td>
                      <td className="px-4 py-2 font-semibold text-gray-800 dark:text-gray-100">
                        <Resaltar texto={cb.nombre} termino={filtros.busquedaAplicada} />
                      </td>
                      <td className="px-4 py-2">
                        <Resaltar texto={cb.banco} termino={filtros.busquedaAplicada} />
                      </td>
                      <td className="px-4 py-2 font-mono text-xs">
                        <Resaltar texto={cb.numeroCuenta} termino={filtros.busquedaAplicada} />
                      </td>
                      <td className="px-4 py-2 font-mono text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400">
                        {cb.tipoCuenta === "AHORROS" ? "Ahorros" : "Corriente"}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <div className="flex justify-end gap-3">
                          <button onClick={() => abrirEdicion(cb)} className={CLASE_ACCION}>
                            Editar
                          </button>
                          <button onClick={() => confirmarDesactivar(cb)} className={CLASE_ACCION_PELIGRO}>
                            Desactivar
                          </button>
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* Pie (como el de Facturas emitidas): cuántas cuentas hay en lo filtrado, por tipo */}
        {cuentasFiltradas && cuentasFiltradas.length > 0 && (
          <div className="flex flex-wrap items-center justify-end gap-x-6 gap-y-1 px-4 py-2.5 border-t-2 border-gray-900 dark:border-gray-200">
            <span className="font-mono text-[11px] uppercase tracking-wider text-gray-500 dark:text-gray-400">
              {cuentasFiltradas.filter((cb) => cb.tipoCuenta === "AHORROS").length} ahorros ·{" "}
              {cuentasFiltradas.filter((cb) => cb.tipoCuenta === "CORRIENTE").length} corriente
              {filtros.hayFiltros ? " · según filtro" : ""}
            </span>
            <span className="text-sm font-bold text-gray-900 dark:text-gray-50">
              CUENTAS <span className="font-mono tabular-nums ml-2">{cuentasFiltradas.length}</span>
            </span>
          </div>
        )}
      </PanelListado>
    </div>
  );
}
