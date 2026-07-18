// Controles de paginación reutilizables: "Anterior"/"Siguiente" + indicador
// de página. Pensado para ir como pie de una tabla (mismo borde superior que
// separa las filas). Se usa junto con las rutas que devuelven
// RespuestaPaginada<T> (ver api/client.ts).

interface Props {
  page: number;
  totalPaginas: number;
  total: number;
  onCambiarPagina: (page: number) => void;
}

export function Paginacion({ page, totalPaginas, total, onCambiarPagina }: Props) {
  // Si todo cabe en una sola página, no tiene sentido mostrar los controles.
  if (totalPaginas <= 1) return null;

  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 dark:border-gray-700 text-sm">
      <span className="text-gray-500 dark:text-gray-400">
        Página {page} de {totalPaginas} · {total} registro{total === 1 ? "" : "s"}
      </span>
      <div className="flex gap-2">
        <button
          onClick={() => onCambiarPagina(page - 1)}
          disabled={page <= 1}
          className="px-3 py-1.5 rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-700"
        >
          Anterior
        </button>
        <button
          onClick={() => onCambiarPagina(page + 1)}
          disabled={page >= totalPaginas}
          className="px-3 py-1.5 rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-700"
        >
          Siguiente
        </button>
      </div>
    </div>
  );
}
