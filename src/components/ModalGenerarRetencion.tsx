import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type Compra } from "../api/client";
import { Modal } from "./Modal";
import { useToast } from "./ToastProvider";

interface Props {
  compra: Compra;
  onCerrar: () => void;
}

interface LineaForm {
  tipoImpuesto: "IVA" | "RENTA";
  clasificacion: "BIEN" | "SERVICIO";
  codigoRetencion: string;
  baseImponible: string;
  porcentaje: string;
}

function lineaVacia(): LineaForm {
  return { tipoImpuesto: "IVA", clasificacion: "BIEN", codigoRetencion: "", baseImponible: "", porcentaje: "" };
}

function valorRetenido(linea: LineaForm): number {
  const base = parseFloat(linea.baseImponible) || 0;
  const porcentaje = parseFloat(linea.porcentaje) || 0;
  return (base * porcentaje) / 100;
}

// Genera el comprobante de retención (IVA y/o Renta) sobre una compra ya
// registrada — el % y el código de cada línea SIEMPRE se ingresan a mano
// (ver backend/src/utils/retenciones.ts: el SRI actualiza esas tablas
// periódicamente, no hay un catálogo interno acá).
export function ModalGenerarRetencion({ compra, onCerrar }: Props) {
  const queryClient = useQueryClient();
  const { mostrarToast } = useToast();
  const [lineas, setLineas] = useState<LineaForm[]>([lineaVacia()]);

  const saldoPendiente = parseFloat(compra.total) - parseFloat(compra.montoPagado);
  const totalRetenido = lineas.reduce((acc, l) => acc + valorRetenido(l), 0);
  const excedeSaldo = totalRetenido > saldoPendiente + 0.005;

  function actualizarLinea(indice: number, cambios: Partial<LineaForm>) {
    setLineas((actual) => actual.map((l, i) => (i === indice ? { ...l, ...cambios } : l)));
  }

  function agregarLinea() {
    setLineas((actual) => [...actual, lineaVacia()]);
  }

  function quitarLinea(indice: number) {
    setLineas((actual) => actual.filter((_, i) => i !== indice));
  }

  const lineasValidas =
    lineas.length > 0 &&
    lineas.every((l) => l.codigoRetencion.trim() !== "" && parseFloat(l.baseImponible) > 0 && l.porcentaje !== "" && parseFloat(l.porcentaje) >= 0 && parseFloat(l.porcentaje) <= 100);

  const generarRetencion = useMutation({
    mutationFn: async () =>
      api.post("/retenciones", {
        compraId: compra.id,
        lineas: lineas.map((l) => ({
          tipoImpuesto: l.tipoImpuesto,
          clasificacion: l.clasificacion,
          codigoRetencion: l.codigoRetencion.trim(),
          baseImponible: parseFloat(l.baseImponible),
          porcentaje: parseFloat(l.porcentaje),
        })),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["compras"] });
      mostrarToast("Retención generada", "success");
      onCerrar();
    },
    onError: (error: any) => {
      mostrarToast(error.response?.data?.error ?? "Error al generar la retención");
    },
  });

  return (
    <Modal titulo={`Generar retención — Fact. ${compra.numeroFactura}`} onCerrar={onCerrar} ancho="max-w-2xl">
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
        Proveedor: <span className="text-gray-800 dark:text-gray-100">{compra.proveedor.razonSocial}</span> · Saldo
        pendiente: <span className="font-semibold text-gray-800 dark:text-gray-100">${saldoPendiente.toFixed(2)}</span>
      </p>

      <div className="space-y-3 mb-3">
        {lineas.map((linea, indice) => (
          <div key={indice} className="border border-stone-300 dark:border-gray-700 rounded-md p-3">
            <div className="flex justify-between items-center mb-2">
              <p className="text-xs font-semibold text-gray-600 dark:text-gray-300">Línea {indice + 1}</p>
              {lineas.length > 1 && (
                <button
                  type="button"
                  onClick={() => quitarLinea(indice)}
                  className="text-red-500 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 text-xs"
                >
                  ✕ Quitar
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2 mb-2">
              <div>
                <label className="block font-mono text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500">Impuesto</label>
                <select
                  value={linea.tipoImpuesto}
                  onChange={(e) => actualizarLinea(indice, { tipoImpuesto: e.target.value as "IVA" | "RENTA" })}
                  className="w-full border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-2 py-1 text-sm"
                >
                  <option value="IVA">IVA</option>
                  <option value="RENTA">Renta</option>
                </select>
              </div>
              <div>
                <label className="block font-mono text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500">Clasificación</label>
                <select
                  value={linea.clasificacion}
                  onChange={(e) => actualizarLinea(indice, { clasificacion: e.target.value as "BIEN" | "SERVICIO" })}
                  className="w-full border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-2 py-1 text-sm"
                >
                  <option value="BIEN">Bien</option>
                  <option value="SERVICIO">Servicio</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block font-mono text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500">Código de retención</label>
                <input
                  type="text"
                  placeholder="Ej: 312"
                  value={linea.codigoRetencion}
                  onChange={(e) => actualizarLinea(indice, { codigoRetencion: e.target.value })}
                  className="w-full border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-2 py-1 text-sm"
                />
              </div>
              <div>
                <label className="block font-mono text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500">Base imponible</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  placeholder="0.00"
                  value={linea.baseImponible}
                  onChange={(e) => actualizarLinea(indice, { baseImponible: e.target.value })}
                  className="w-full border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-2 py-1 text-sm"
                />
              </div>
              <div>
                <label className="block font-mono text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500">% a retener</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  placeholder="0.00"
                  value={linea.porcentaje}
                  onChange={(e) => actualizarLinea(indice, { porcentaje: e.target.value })}
                  className="w-full border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-2 py-1 text-sm"
                />
              </div>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 text-right">
              Valor retenido: <span className="font-medium text-gray-800 dark:text-gray-100">${valorRetenido(linea).toFixed(2)}</span>
            </p>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={agregarLinea}
        className="text-xs text-sky-600 dark:text-sky-400 hover:underline mb-4"
      >
        + Agregar línea
      </button>

      <div className="border-t border-stone-300 dark:border-gray-700 pt-3">
        <div className={`flex justify-between font-semibold mb-3 ${excedeSaldo ? "text-red-600 dark:text-red-400" : "text-gray-800 dark:text-gray-100"}`}>
          <span>Total retenido</span>
          <span>${totalRetenido.toFixed(2)}</span>
        </div>
        {excedeSaldo && (
          <p className="text-xs text-red-600 dark:text-red-400 mb-3">
            El total retenido no puede superar el saldo pendiente de la compra (${saldoPendiente.toFixed(2)}).
          </p>
        )}
        <button
          type="button"
          onClick={() => generarRetencion.mutate()}
          disabled={!lineasValidas || excedeSaldo || generarRetencion.isPending}
          className="w-full bg-brand-700 text-white py-2 rounded-md text-sm font-semibold hover:bg-brand-800 disabled:opacity-40"
        >
          {generarRetencion.isPending ? "Generando..." : "Generar retención"}
        </button>
        {generarRetencion.isError && (
          <p className="text-red-600 dark:text-red-400 text-sm mt-2">
            {(generarRetencion.error as any)?.response?.data?.error ?? "Error al generar la retención"}
          </p>
        )}
      </div>
    </Modal>
  );
}
