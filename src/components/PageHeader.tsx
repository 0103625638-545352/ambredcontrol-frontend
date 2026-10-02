import type { ReactNode } from "react";

interface Props {
  titulo: string;
  subtitulo?: ReactNode;
  acciones?: ReactNode;
}

// Encabezado de página/sección — reemplaza el <h2 className="text-lg
// font-semibold..."> repetido en casi todas las pantallas. Usa el
// mismo título en negrita que la barra superior de los documentos (ver
// components/FormatoDocumento.tsx), sin barra de acento.
export function PageHeader({ titulo, subtitulo, acciones }: Props) {
  return (
    <div className="flex items-start justify-between gap-3 mb-4">
      <div className="flex items-start gap-2.5">
        <div>
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-50 leading-tight">{titulo}</h2>
          {subtitulo && <div className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{subtitulo}</div>}
        </div>
      </div>
      {acciones && <div className="flex items-center gap-2 shrink-0">{acciones}</div>}
    </div>
  );
}
