import type { ReactNode } from "react";
import { Modal } from "./Modal";

export interface CampoFila<T> {
  etiqueta: string;
  obtenerValor: (fila: T) => ReactNode;
}

interface Props<T> {
  titulo: string;
  fila: T;
  campos: CampoFila<T>[];
  onCerrar: () => void;
}

// Detalle "plano" para filas que no tienen nada más que mostrar de lo que ya
// trae el listado (Categorías, Usuarios, Auditoría) — no pide nada al
// backend, solo reordena/etiqueta los campos que ya se cargaron en la tabla.
export function DetalleFilaModal<T>({ titulo, fila, campos, onCerrar }: Props<T>) {
  return (
    <Modal titulo={titulo} onCerrar={onCerrar}>
      <div className="space-y-3 text-sm">
        {campos.map((c) => (
          <div key={c.etiqueta}>
            <p className="text-xs text-gray-500 dark:text-gray-400">{c.etiqueta}</p>
            <p className="text-gray-800 dark:text-gray-100">{c.obtenerValor(fila)}</p>
          </div>
        ))}
      </div>
    </Modal>
  );
}
