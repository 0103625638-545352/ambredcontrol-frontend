import type { ReactNode } from "react";

interface Props {
  titulo: string;
  subtitulo?: ReactNode;
  acciones?: ReactNode;
}

// Encabezado de página/sección — reemplaza el <h2 className="text-lg
// font-semibold..."> repetido en casi todas las pantallas. El acento a la
// izquierda (barra de color de marca) es la firma visual que distingue esta
// app de una plantilla Tailwind genérica: se repite igual en cada pantalla,
// como el encabezado de un formulario en Odoo.
export function PageHeader({ titulo, subtitulo, acciones }: Props) {
  return (
    <div className="flex items-start justify-between gap-3 mb-4">
      <div className="flex items-start gap-2.5">
        <span className="w-1 self-stretch rounded-full bg-brand-600 shrink-0" aria-hidden="true" />
        <div>
          <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100 leading-tight">{titulo}</h2>
          {subtitulo && <div className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{subtitulo}</div>}
        </div>
      </div>
      {acciones && <div className="flex items-center gap-2 shrink-0">{acciones}</div>}
    </div>
  );
}
