import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type CuentaContable } from "../api/client";
import { Modal } from "./Modal";
import { useToast } from "./ToastProvider";

interface Props {
  onCerrar: () => void;
}

interface LineaForm {
  cuentaId: number | "";
  debe: string;
  haber: string;
  glosa: string;
}

function lineaVacia(): LineaForm {
  return { cuentaId: "", debe: "", haber: "", glosa: "" };
}

// Asiento manual: para todo lo que el sistema no documenta solo (arriendo,
// sueldos, servicios, aportes de capital, ajustes de fin de período). Las
// ventas/compras/pagos ya generan su asiento solos — esto es solo para el
// resto.
export function ModalCrearAsientoManual({ onCerrar }: Props) {
  const queryClient = useQueryClient();
  const { mostrarToast } = useToast();
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [descripcion, setDescripcion] = useState("");
  const [lineas, setLineas] = useState<LineaForm[]>([lineaVacia(), lineaVacia()]);

  const { data: cuentas } = useQuery({
    queryKey: ["contabilidad", "plan-cuentas"],
    queryFn: async () => (await api.get<CuentaContable[]>("/contabilidad/plan-cuentas")).data,
  });
  const cuentasActivas = (cuentas ?? []).filter((c) => c.activa && c.permiteMovimiento);

  function actualizarLinea(indice: number, cambios: Partial<LineaForm>) {
    setLineas((actual) => actual.map((l, i) => (i === indice ? { ...l, ...cambios } : l)));
  }

  function agregarLinea() {
    setLineas((actual) => [...actual, lineaVacia()]);
  }

  function quitarLinea(indice: number) {
    setLineas((actual) => actual.filter((_, i) => i !== indice));
  }

  const totalDebe = lineas.reduce((acc, l) => acc + (parseFloat(l.debe) || 0), 0);
  const totalHaber = lineas.reduce((acc, l) => acc + (parseFloat(l.haber) || 0), 0);
  const cuadra = totalDebe > 0 && Math.abs(totalDebe - totalHaber) < 0.005;

  const formularioValido =
    descripcion.trim() !== "" &&
    fecha !== "" &&
    lineas.length >= 2 &&
    lineas.every((l) => l.cuentaId !== "" && ((parseFloat(l.debe) || 0) > 0 || (parseFloat(l.haber) || 0) > 0)) &&
    cuadra;

  const crearAsiento = useMutation({
    mutationFn: async () =>
      api.post("/contabilidad/asientos", {
        fecha,
        descripcion: descripcion.trim(),
        lineas: lineas.map((l) => ({
          cuentaId: l.cuentaId,
          debe: parseFloat(l.debe) || 0,
          haber: parseFloat(l.haber) || 0,
          glosa: l.glosa.trim() || undefined,
        })),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contabilidad"] });
      mostrarToast("Asiento manual creado", "success");
      onCerrar();
    },
    onError: (error: any) => {
      mostrarToast(error.response?.data?.error ?? "Error al crear el asiento");
    },
  });

  return (
    <Modal titulo="Nuevo asiento manual" onCerrar={onCerrar} ancho="max-w-2xl">
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div>
          <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Fecha</label>
          <input
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Descripción</label>
          <input
            type="text"
            placeholder="Ej: Pago de arriendo de julio"
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div className="space-y-2 mb-3">
        {lineas.map((linea, indice) => (
          <div key={indice} className="grid grid-cols-12 gap-2 items-start">
            <div className="col-span-5">
              <select
                value={linea.cuentaId}
                onChange={(e) => actualizarLinea(indice, { cuentaId: e.target.value ? Number(e.target.value) : "" })}
                className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded px-2 py-1.5 text-sm"
              >
                <option value="">Cuenta...</option>
                {cuentasActivas.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.codigo} - {c.nombre}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-span-2">
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="Debe"
                value={linea.debe}
                onChange={(e) => actualizarLinea(indice, { debe: e.target.value, haber: e.target.value ? "" : linea.haber })}
                className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded px-2 py-1.5 text-sm"
              />
            </div>
            <div className="col-span-2">
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="Haber"
                value={linea.haber}
                onChange={(e) => actualizarLinea(indice, { haber: e.target.value, debe: e.target.value ? "" : linea.debe })}
                className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded px-2 py-1.5 text-sm"
              />
            </div>
            <div className="col-span-2">
              <input
                type="text"
                placeholder="Glosa"
                value={linea.glosa}
                onChange={(e) => actualizarLinea(indice, { glosa: e.target.value })}
                className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded px-2 py-1.5 text-sm"
              />
            </div>
            <div className="col-span-1 flex justify-center pt-1.5">
              {lineas.length > 2 && (
                <button
                  type="button"
                  onClick={() => quitarLinea(indice)}
                  className="text-red-500 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 text-xs"
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      <button type="button" onClick={agregarLinea} className="text-xs text-sky-600 dark:text-sky-400 hover:underline mb-4">
        + Agregar línea
      </button>

      <div className="border-t border-gray-200 dark:border-gray-700 pt-3">
        <div className={`flex justify-between text-sm mb-1 ${cuadra ? "text-gray-600 dark:text-gray-300" : "text-red-600 dark:text-red-400"}`}>
          <span>Total Debe: ${totalDebe.toFixed(2)}</span>
          <span>Total Haber: ${totalHaber.toFixed(2)}</span>
        </div>
        {!cuadra && (
          <p className="text-xs text-red-600 dark:text-red-400 mb-3">El asiento debe cuadrar: Debe y Haber tienen que sumar lo mismo.</p>
        )}
        <button
          type="button"
          onClick={() => crearAsiento.mutate()}
          disabled={!formularioValido || crearAsiento.isPending}
          className="w-full bg-brand-600 text-white py-2 rounded-md text-sm font-medium hover:bg-brand-700 disabled:opacity-40 mt-2"
        >
          {crearAsiento.isPending ? "Creando..." : "Crear asiento"}
        </button>
        {crearAsiento.isError && (
          <p className="text-red-600 dark:text-red-400 text-sm mt-2">
            {(crearAsiento.error as any)?.response?.data?.error ?? "Error al crear el asiento"}
          </p>
        )}
      </div>
    </Modal>
  );
}
