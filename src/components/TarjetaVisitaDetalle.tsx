import type { ReactNode } from "react";
import { urlArchivoSubido, type EquipoDejadoVisita } from "../api/client";

const ETIQUETA_ESTADO: Record<string, string> = {
  PENDIENTE: "Pendiente",
  COMPLETADA: "Completada",
  OMITIDA: "Omitida",
};

const CLASE_ESTADO: Record<string, string> = {
  PENDIENTE: "bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300",
  COMPLETADA: "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300",
  OMITIDA: "bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300",
};

interface VisitaParaTarjeta {
  id: number;
  estado: "PENDIENTE" | "COMPLETADA" | "OMITIDA";
  esUrgente?: boolean;
  direccion: string | null;
  descripcionTrabajo?: string | null;
  fotoTrabajoUrl?: string | null;
  fotoViviendaUrl?: string | null;
  equiposDejados?: EquipoDejadoVisita[];
}

// Una visita técnica con su acta completa (trabajo hecho, equipos dejados,
// fotos) — misma tarjeta reutilizada en el detalle de una ruta
// (ModalDetalleRuta), el historial de un cliente (HistorialClienteModal) y
// el historial por técnico/rango de fechas (HistorialVisitasPage). Lo único
// que cambia entre esos tres lugares es la línea de encabezado (acá
// "orden. nombre", allá "fecha — técnico", etc.), por eso se recibe como
// children en vez de armarse adentro.
export function TarjetaVisitaDetalle({ visita, encabezado }: { visita: VisitaParaTarjeta; encabezado: ReactNode }) {
  const equipos = visita.equiposDejados ?? [];
  return (
    <div
      className={`border rounded-md p-3 ${
        visita.esUrgente ? "border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-900/10" : "border-gray-200 dark:border-gray-700"
      }`}
    >
      <div className="flex justify-between items-start gap-2 mb-1">
        <div>
          <p className="text-sm font-medium text-gray-800 dark:text-gray-100">
            {visita.esUrgente && <span className="text-red-600 dark:text-red-400 mr-1">🚨 Urgente —</span>}
            {encabezado}
          </p>
          {visita.direccion && <p className="text-xs text-gray-500 dark:text-gray-400">{visita.direccion}</p>}
        </div>
        <span className={`px-2 py-1 rounded-full text-xs font-medium shrink-0 ${CLASE_ESTADO[visita.estado]}`}>
          {ETIQUETA_ESTADO[visita.estado]}
        </span>
      </div>

      {visita.descripcionTrabajo && (
        <p className="text-xs text-gray-600 dark:text-gray-300 mt-2">
          <span className="font-medium">Trabajo:</span> {visita.descripcionTrabajo}
        </p>
      )}

      {equipos.length > 0 && (
        <div className="mt-2">
          <p className="text-[10px] font-medium text-gray-500 dark:text-gray-400 mb-1">Equipos dejados</p>
          <table className="w-full text-xs">
            <thead className="text-gray-400 dark:text-gray-500 text-left">
              <tr>
                <th className="pr-2 font-normal">Tipo</th>
                <th className="pr-2 font-normal">Modelo</th>
                <th className="font-normal">Serial / MAC</th>
              </tr>
            </thead>
            <tbody>
              {equipos.map((e) => (
                <tr key={e.id} className="text-gray-700 dark:text-gray-300">
                  <td className="pr-2 py-0.5">{e.tipo}</td>
                  <td className="pr-2 py-0.5">{e.modelo ?? "—"}</td>
                  <td className="py-0.5 font-mono">{e.serial ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(visita.fotoTrabajoUrl || visita.fotoViviendaUrl) && (
        <div className="flex gap-3 mt-2">
          {visita.fotoTrabajoUrl && (
            <a href={urlArchivoSubido(visita.fotoTrabajoUrl)!} target="_blank" rel="noreferrer">
              <img src={urlArchivoSubido(visita.fotoTrabajoUrl)!} alt="Trabajo realizado" className="h-20 rounded-md object-cover" />
              <p className="text-[10px] text-gray-400 dark:text-gray-500 text-center mt-0.5">Trabajo</p>
            </a>
          )}
          {visita.fotoViviendaUrl && (
            <a href={urlArchivoSubido(visita.fotoViviendaUrl)!} target="_blank" rel="noreferrer">
              <img src={urlArchivoSubido(visita.fotoViviendaUrl)!} alt="Vivienda" className="h-20 rounded-md object-cover" />
              <p className="text-[10px] text-gray-400 dark:text-gray-500 text-center mt-0.5">Vivienda</p>
            </a>
          )}
        </div>
      )}

      {!visita.descripcionTrabajo && equipos.length === 0 && !visita.fotoTrabajoUrl && !visita.fotoViviendaUrl && (
        <p className="text-xs text-gray-400 dark:text-gray-500 italic mt-1">Sin detalle de trabajo registrado.</p>
      )}
    </div>
  );
}
