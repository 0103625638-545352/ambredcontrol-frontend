import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { Modal } from "./Modal";
import { useToast } from "./ToastProvider";

interface Props {
  onCerrar: () => void;
  onRegistrado: () => void;
}

// Ingreso/egreso de efectivo que NO viene de una venta ni una compra (ej.
// retiro para gastos, aporte del dueño) — requiere una caja ya abierta en tu
// sucursal (ver POST /caja/movimientos).
export function ModalMovimientoCaja({ onCerrar, onRegistrado }: Props) {
  const queryClient = useQueryClient();
  const { mostrarToast } = useToast();
  const [tipo, setTipo] = useState<"INGRESO" | "EGRESO">("INGRESO");
  const [monto, setMonto] = useState("");
  const [motivo, setMotivo] = useState("");

  const registrarMovimiento = useMutation({
    mutationFn: async () => api.post("/caja/movimientos", { tipo, monto: parseFloat(monto), motivo }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["caja", "actual"] });
      mostrarToast("Movimiento registrado", "success");
      onRegistrado();
    },
    onError: (error: any) => {
      mostrarToast(error.response?.data?.error ?? "Error al registrar el movimiento");
    },
  });

  return (
    <Modal titulo="Registrar movimiento de caja" onCerrar={onCerrar}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          registrarMovimiento.mutate();
        }}
        className="space-y-3"
      >
        <div>
          <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Tipo</label>
          <select
            value={tipo}
            onChange={(e) => setTipo(e.target.value as "INGRESO" | "EGRESO")}
            className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm"
          >
            <option value="INGRESO">Ingreso (entra dinero a la caja)</option>
            <option value="EGRESO">Egreso (sale dinero de la caja)</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Monto</label>
          <input
            type="number"
            step="0.01"
            min="0.01"
            required
            autoFocus
            placeholder="0.00"
            value={monto}
            onChange={(e) => setMonto(e.target.value)}
            className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Motivo</label>
          <input
            type="text"
            required
            placeholder="Ej: Retiro para compra de insumos"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm"
          />
        </div>
        <button
          type="submit"
          disabled={registrarMovimiento.isPending}
          className="w-full bg-emerald-600 text-white py-2 rounded-md text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
        >
          {registrarMovimiento.isPending ? "Registrando..." : "Registrar movimiento"}
        </button>
        {registrarMovimiento.isError && (
          <p className="text-red-600 dark:text-red-400 text-sm">
            {(registrarMovimiento.error as any)?.response?.data?.error ?? "Error al registrar el movimiento"}
          </p>
        )}
      </form>
    </Modal>
  );
}
