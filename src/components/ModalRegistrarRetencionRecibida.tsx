import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type Factura } from "../api/client";
import { Modal } from "./Modal";
import { useToast } from "./ToastProvider";

interface Props {
  factura: Factura;
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

// Registra una retención que un CLIENTE ya practicó sobre esta factura y nos
// entregó su propio comprobante — a diferencia de ModalGenerarRetencion (que
// esta empresa emite al SRI), acá no hay clave de acceso ni envío: solo se
// anota el número del comprobante del cliente y los valores retenidos.
export function ModalRegistrarRetencionRecibida({ factura, onCerrar }: Props) {
  const queryClient = useQueryClient();
  const { mostrarToast } = useToast();
  const [numeroComprobante, setNumeroComprobante] = useState("");
  const [fechaEmision, setFechaEmision] = useState(new Date().toISOString().slice(0, 10));
  const [lineas, setLineas] = useState<LineaForm[]>([lineaVacia()]);

  const saldoPendiente = parseFloat(factura.total) - parseFloat(factura.montoPagado);
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

  const formularioValido =
    numeroComprobante.trim() !== "" &&
    fechaEmision !== "" &&
    lineas.length > 0 &&
    lineas.every((l) => l.codigoRetencion.trim() !== "" && parseFloat(l.baseImponible) > 0 && l.porcentaje !== "" && parseFloat(l.porcentaje) >= 0 && parseFloat(l.porcentaje) <= 100);

  const registrarRetencion = useMutation({
    mutationFn: async () =>
      api.post("/retenciones-recibidas", {
        facturaId: factura.id,
        numeroComprobante: numeroComprobante.trim(),
        fechaEmision,
        lineas: lineas.map((l) => ({
          tipoImpuesto: l.tipoImpuesto,
          clasificacion: l.clasificacion,
          codigoRetencion: l.codigoRetencion.trim(),
          baseImponible: parseFloat(l.baseImponible),
          porcentaje: parseFloat(l.porcentaje),
        })),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["facturas"] });
      mostrarToast("Retención recibida registrada", "success");
      onCerrar();
    },
    onError: (error: any) => {
      mostrarToast(error.response?.data?.error ?? "Error al registrar la retención recibida");
    },
  });

  return (
    <Modal titulo={`Registrar retención recibida — ${factura.secuencial}`} onCerrar={onCerrar} ancho="max-w-2xl">
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
        Cliente: <span className="text-gray-800 dark:text-gray-100">{factura.cliente.razonSocial}</span> · Saldo
        pendiente: <span className="font-semibold text-gray-800 dark:text-gray-100">${saldoPendiente.toFixed(2)}</span>
      </p>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div>
          <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">N° de comprobante del cliente</label>
          <input
            type="text"
            placeholder="Ej: 001-001-000000123"
            value={numeroComprobante}
            onChange={(e) => setNumeroComprobante(e.target.value)}
            className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Fecha de emisión</label>
          <input
            type="date"
            value={fechaEmision}
            onChange={(e) => setFechaEmision(e.target.value)}
            className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div className="space-y-3 mb-3">
        {lineas.map((linea, indice) => (
          <div key={indice} className="border border-gray-200 dark:border-gray-700 rounded-md p-3">
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
                <label className="block text-[10px] text-gray-500 dark:text-gray-400">Impuesto</label>
                <select
                  value={linea.tipoImpuesto}
                  onChange={(e) => actualizarLinea(indice, { tipoImpuesto: e.target.value as "IVA" | "RENTA" })}
                  className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded px-2 py-1 text-sm"
                >
                  <option value="IVA">IVA</option>
                  <option value="RENTA">Renta</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] text-gray-500 dark:text-gray-400">Clasificación</label>
                <select
                  value={linea.clasificacion}
                  onChange={(e) => actualizarLinea(indice, { clasificacion: e.target.value as "BIEN" | "SERVICIO" })}
                  className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded px-2 py-1 text-sm"
                >
                  <option value="BIEN">Bien</option>
                  <option value="SERVICIO">Servicio</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-[10px] text-gray-500 dark:text-gray-400">Código de retención</label>
                <input
                  type="text"
                  placeholder="Ej: 312"
                  value={linea.codigoRetencion}
                  onChange={(e) => actualizarLinea(indice, { codigoRetencion: e.target.value })}
                  className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded px-2 py-1 text-sm"
                />
              </div>
              <div>
                <label className="block text-[10px] text-gray-500 dark:text-gray-400">Base imponible</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  placeholder="0.00"
                  value={linea.baseImponible}
                  onChange={(e) => actualizarLinea(indice, { baseImponible: e.target.value })}
                  className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded px-2 py-1 text-sm"
                />
              </div>
              <div>
                <label className="block text-[10px] text-gray-500 dark:text-gray-400">% retenido</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  placeholder="0.00"
                  value={linea.porcentaje}
                  onChange={(e) => actualizarLinea(indice, { porcentaje: e.target.value })}
                  className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded px-2 py-1 text-sm"
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

      <div className="border-t border-gray-200 dark:border-gray-700 pt-3">
        <div className={`flex justify-between font-semibold mb-3 ${excedeSaldo ? "text-red-600 dark:text-red-400" : "text-gray-800 dark:text-gray-100"}`}>
          <span>Total retenido</span>
          <span>${totalRetenido.toFixed(2)}</span>
        </div>
        {excedeSaldo && (
          <p className="text-xs text-red-600 dark:text-red-400 mb-3">
            El total retenido no puede superar el saldo pendiente de la factura (${saldoPendiente.toFixed(2)}).
          </p>
        )}
        <button
          type="button"
          onClick={() => registrarRetencion.mutate()}
          disabled={!formularioValido || excedeSaldo || registrarRetencion.isPending}
          className="w-full bg-brand-600 text-white py-2 rounded-md text-sm font-medium hover:bg-brand-700 disabled:opacity-40"
        >
          {registrarRetencion.isPending ? "Registrando..." : "Registrar retención recibida"}
        </button>
        {registrarRetencion.isError && (
          <p className="text-red-600 dark:text-red-400 text-sm mt-2">
            {(registrarRetencion.error as any)?.response?.data?.error ?? "Error al registrar la retención recibida"}
          </p>
        )}
      </div>
    </Modal>
  );
}
