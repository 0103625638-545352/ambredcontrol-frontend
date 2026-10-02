import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type TipoCuentaContable, type NaturalezaCuenta } from "../api/client";
import { Modal } from "./Modal";
import { useToast } from "./ToastProvider";

interface Props {
  onCerrar: () => void;
}

const TIPOS: { valor: TipoCuentaContable; etiqueta: string; naturaleza: NaturalezaCuenta }[] = [
  { valor: "ACTIVO", etiqueta: "Activo", naturaleza: "DEUDORA" },
  { valor: "PASIVO", etiqueta: "Pasivo", naturaleza: "ACREEDORA" },
  { valor: "PATRIMONIO", etiqueta: "Patrimonio", naturaleza: "ACREEDORA" },
  { valor: "INGRESO", etiqueta: "Ingreso", naturaleza: "ACREEDORA" },
  { valor: "COSTO", etiqueta: "Costo", naturaleza: "DEUDORA" },
  { valor: "GASTO", etiqueta: "Gasto", naturaleza: "DEUDORA" },
];

// Alta de una cuenta nueva al plan de cuentas. La naturaleza se deriva del
// tipo elegido (Activo/Costo/Gasto siempre son deudoras; Pasivo/Patrimonio/
// Ingreso siempre acreedoras) — no tiene sentido dejar que se contradigan.
export function ModalCrearCuenta({ onCerrar }: Props) {
  const queryClient = useQueryClient();
  const { mostrarToast } = useToast();
  const [codigo, setCodigo] = useState("");
  const [nombre, setNombre] = useState("");
  const [tipo, setTipo] = useState<TipoCuentaContable>("GASTO");

  const naturaleza = TIPOS.find((t) => t.valor === tipo)!.naturaleza;
  const formularioValido = codigo.trim() !== "" && nombre.trim() !== "";

  const crearCuenta = useMutation({
    mutationFn: async () => api.post("/contabilidad/plan-cuentas", { codigo: codigo.trim(), nombre: nombre.trim(), tipo, naturaleza }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contabilidad", "plan-cuentas"] });
      mostrarToast("Cuenta creada", "success");
      onCerrar();
    },
    onError: (error: any) => {
      mostrarToast(error.response?.data?.error ?? "Error al crear la cuenta");
    },
  });

  return (
    <Modal titulo="Nueva cuenta contable" onCerrar={onCerrar}>
      <div className="space-y-3">
        <div>
          <label className="block font-mono text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1">Código</label>
          <input
            type="text"
            placeholder="Ej: 6.1.02"
            value={codigo}
            onChange={(e) => setCodigo(e.target.value)}
            className="w-full border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-2 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="block font-mono text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1">Nombre</label>
          <input
            type="text"
            placeholder="Ej: Servicios básicos"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            className="w-full border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-2 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="block font-mono text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1">Tipo</label>
          <select
            value={tipo}
            onChange={(e) => setTipo(e.target.value as TipoCuentaContable)}
            className="w-full border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-2 py-1.5 text-sm"
          >
            {TIPOS.map((t) => (
              <option key={t.valor} value={t.valor}>
                {t.etiqueta}
              </option>
            ))}
          </select>
          <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">
            Naturaleza: {naturaleza === "DEUDORA" ? "Deudora (aumenta con Debe)" : "Acreedora (aumenta con Haber)"}
          </p>
        </div>

        <button
          type="button"
          onClick={() => crearCuenta.mutate()}
          disabled={!formularioValido || crearCuenta.isPending}
          className="w-full bg-brand-700 text-white py-2 rounded-md text-sm font-semibold hover:bg-brand-800 disabled:opacity-40"
        >
          {crearCuenta.isPending ? "Creando..." : "Crear cuenta"}
        </button>
        {crearCuenta.isError && (
          <p className="text-red-600 dark:text-red-400 text-sm">
            {(crearCuenta.error as any)?.response?.data?.error ?? "Error al crear la cuenta"}
          </p>
        )}
      </div>
    </Modal>
  );
}
