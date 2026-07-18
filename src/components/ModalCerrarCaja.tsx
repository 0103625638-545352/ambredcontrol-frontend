import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { Modal } from "./Modal";
import { useToast } from "./ToastProvider";
import { useConfirm } from "./ConfirmProvider";

interface Props {
  efectivoEsperado: string; // ya cargado por CajaPage, no se vuelve a pedir acá
  onCerrar: () => void;
  onCerrado: () => void;
}

// Cierre de caja con arqueo: el cajero cuenta el efectivo físico y el
// sistema muestra la diferencia contra lo esperado. La diferencia mostrada
// acá es solo para que el cajero la vea MIENTRAS escribe — el valor que
// realmente se persiste lo calcula siempre el backend (ver POST /caja/cerrar).
export function ModalCerrarCaja({ efectivoEsperado, onCerrar, onCerrado }: Props) {
  const queryClient = useQueryClient();
  const { mostrarToast } = useToast();
  const confirmar = useConfirm();
  const [montoContado, setMontoContado] = useState("");
  const [observaciones, setObservaciones] = useState("");

  const diferencia = montoContado === "" ? null : parseFloat(montoContado) - parseFloat(efectivoEsperado);

  const cerrarCaja = useMutation({
    mutationFn: async () => api.post("/caja/cerrar", { montoContado: parseFloat(montoContado), observaciones: observaciones || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["caja", "actual"] });
      queryClient.invalidateQueries({ queryKey: ["caja", "historial"] });
      mostrarToast("Caja cerrada", "success");
      onCerrado();
    },
    onError: (error: any) => {
      mostrarToast(error.response?.data?.error ?? "Error al cerrar la caja");
    },
  });

  async function confirmarCierre(e: React.FormEvent) {
    e.preventDefault();
    if (diferencia !== null && Math.abs(diferencia) > 0.005) {
      const texto = diferencia > 0 ? `sobrante de $${diferencia.toFixed(2)}` : `faltante de $${Math.abs(diferencia).toFixed(2)}`;
      const ok = await confirmar(`Hay un ${texto} contra lo esperado. ¿Cerrar la caja de todos modos?`);
      if (!ok) return;
    }
    cerrarCaja.mutate();
  }

  return (
    <Modal titulo="Cerrar caja" onCerrar={onCerrar}>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
        Efectivo esperado: <span className="font-semibold text-gray-800 dark:text-gray-100">${efectivoEsperado}</span>
      </p>
      <form onSubmit={confirmarCierre} className="space-y-3">
        <div>
          <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Efectivo contado</label>
          <input
            type="number"
            step="0.01"
            min="0"
            required
            autoFocus
            placeholder="0.00"
            value={montoContado}
            onChange={(e) => setMontoContado(e.target.value)}
            className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm"
          />
        </div>
        {diferencia !== null && (
          <p className={`text-sm font-medium ${Math.abs(diferencia) <= 0.005 ? "text-emerald-600 dark:text-emerald-400" : diferencia > 0 ? "text-sky-600 dark:text-sky-400" : "text-red-600 dark:text-red-400"}`}>
            {Math.abs(diferencia) <= 0.005
              ? "Cuadra exacto"
              : diferencia > 0
                ? `Sobrante: $${diferencia.toFixed(2)}`
                : `Faltante: $${Math.abs(diferencia).toFixed(2)}`}
          </p>
        )}
        <div>
          <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Observaciones (opcional)</label>
          <textarea
            value={observaciones}
            onChange={(e) => setObservaciones(e.target.value)}
            rows={2}
            className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm"
          />
        </div>
        <button
          type="submit"
          disabled={cerrarCaja.isPending}
          className="w-full bg-emerald-600 text-white py-2 rounded-md text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
        >
          {cerrarCaja.isPending ? "Cerrando..." : "Confirmar cierre"}
        </button>
        {cerrarCaja.isError && (
          <p className="text-red-600 dark:text-red-400 text-sm">
            {(cerrarCaja.error as any)?.response?.data?.error ?? "Error al cerrar la caja"}
          </p>
        )}
      </form>
    </Modal>
  );
}
