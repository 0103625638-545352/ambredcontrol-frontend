import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, urlArchivoSubido, type VisitaTecnica } from "../api/client";
import { useToast } from "./ToastProvider";

interface EquipoForm {
  key: string;
  tipo: string;
  modelo: string;
  serial: string;
}

function equipoVacio(): EquipoForm {
  return { key: `${Date.now()}-${Math.random()}`, tipo: "", modelo: "", serial: "" };
}

const TIPOS_SUGERIDOS = ["Router Mikrotik", "ONU", "Cable UTP", "Splitter", "Conector"];

// Acta de instalación de una visita — se muestra solo una vez que la
// visita está COMPLETADA (ver PATCH /visitas/:id/llegada). Colapsado por
// defecto para no saturar "Mi ruta de hoy" en el celular del técnico; se
// abre solo, ya con lo guardado, si la visita ya tiene un detalle cargado.
export function DetalleTrabajoVisita({ visita }: { visita: VisitaTecnica }) {
  const queryClient = useQueryClient();
  const { mostrarToast } = useToast();
  const yaTieneDetalle = !!(visita.descripcionTrabajo || (visita.equiposDejados && visita.equiposDejados.length > 0) || visita.fotoTrabajoUrl || visita.fotoViviendaUrl);
  const [abierto, setAbierto] = useState(yaTieneDetalle);
  const [descripcion, setDescripcion] = useState(visita.descripcionTrabajo ?? "");
  const [equipos, setEquipos] = useState<EquipoForm[]>(
    visita.equiposDejados && visita.equiposDejados.length > 0
      ? visita.equiposDejados.map((e) => ({ key: String(e.id), tipo: e.tipo, modelo: e.modelo ?? "", serial: e.serial ?? "" }))
      : []
  );
  const [fotoTrabajo, setFotoTrabajo] = useState<File | null>(null);
  const [fotoVivienda, setFotoVivienda] = useState<File | null>(null);

  const guardar = useMutation({
    mutationFn: async () => {
      const formData = new FormData();
      formData.append("descripcionTrabajo", descripcion);
      formData.append(
        "equipos",
        JSON.stringify(equipos.filter((e) => e.tipo.trim()).map((e) => ({ tipo: e.tipo.trim(), modelo: e.modelo.trim(), serial: e.serial.trim() })))
      );
      if (fotoTrabajo) formData.append("fotoTrabajo", fotoTrabajo);
      if (fotoVivienda) formData.append("fotoVivienda", fotoVivienda);
      return api.patch(`/visitas/${visita.id}/detalle-trabajo`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mi-ruta-hoy"] });
      queryClient.invalidateQueries({ queryKey: ["rutas-visita"] });
      mostrarToast("Detalle del trabajo guardado", "success");
    },
    onError: (error: any) => mostrarToast(error.response?.data?.error ?? "Error al guardar el detalle del trabajo"),
  });

  if (visita.estado !== "COMPLETADA") return null;

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="text-xs font-medium text-slate-700 dark:text-slate-300 hover:underline"
      >
        + Registrar detalle del trabajo (equipos dejados, fotos)
      </button>
    );
  }

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-md p-3 mt-2 space-y-3">
      <div>
        <label className="block text-[10px] text-gray-500 dark:text-gray-400 mb-1">¿Qué trabajo se hizo?</label>
        <textarea
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
          placeholder="ej. Instalación de router, se dejó cableado nuevo hasta la sala"
          rows={2}
          className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-2 py-1.5 text-sm"
        />
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-[10px] text-gray-500 dark:text-gray-400">Equipos dejados</label>
          <button
            type="button"
            onClick={() => setEquipos([...equipos, equipoVacio()])}
            className="text-xs font-medium text-slate-700 dark:text-slate-300 hover:underline"
          >
            + Agregar equipo
          </button>
        </div>
        {equipos.length === 0 && <p className="text-xs text-gray-400 dark:text-gray-500">Ninguno agregado todavía.</p>}
        <div className="space-y-1.5">
          {equipos.map((eq, i) => (
            <div key={eq.key} className="flex gap-1.5 items-center">
              <input
                type="text"
                list="tipos-equipo-sugeridos"
                placeholder="Tipo (ej. Router Mikrotik)"
                value={eq.tipo}
                onChange={(e) => setEquipos(equipos.map((x, j) => (j === i ? { ...x, tipo: e.target.value } : x)))}
                className="flex-1 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-2 py-1 text-xs"
              />
              <input
                type="text"
                placeholder="Modelo (opcional)"
                value={eq.modelo}
                onChange={(e) => setEquipos(equipos.map((x, j) => (j === i ? { ...x, modelo: e.target.value } : x)))}
                className="flex-1 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-2 py-1 text-xs"
              />
              <input
                type="text"
                placeholder="Serial / MAC (opcional)"
                value={eq.serial}
                onChange={(e) => setEquipos(equipos.map((x, j) => (j === i ? { ...x, serial: e.target.value } : x)))}
                className="flex-1 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-2 py-1 text-xs font-mono"
              />
              <button
                type="button"
                onClick={() => setEquipos(equipos.filter((x) => x.key !== eq.key))}
                className="text-red-500 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 text-xs px-1"
                title="Quitar"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
        <datalist id="tipos-equipo-sugeridos">
          {TIPOS_SUGERIDOS.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-[10px] text-gray-500 dark:text-gray-400 mb-1">Foto del trabajo realizado</label>
          {visita.fotoTrabajoUrl && !fotoTrabajo && (
            <a href={urlArchivoSubido(visita.fotoTrabajoUrl)!} target="_blank" rel="noreferrer" className="block mb-1">
              <img src={urlArchivoSubido(visita.fotoTrabajoUrl)!} alt="Trabajo realizado" className="h-16 rounded-md object-cover" />
            </a>
          )}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(e) => setFotoTrabajo(e.target.files?.[0] ?? null)}
            className="text-xs w-full"
          />
        </div>
        <div>
          <label className="block text-[10px] text-gray-500 dark:text-gray-400 mb-1">Foto de la vivienda</label>
          {visita.fotoViviendaUrl && !fotoVivienda && (
            <a href={urlArchivoSubido(visita.fotoViviendaUrl)!} target="_blank" rel="noreferrer" className="block mb-1">
              <img src={urlArchivoSubido(visita.fotoViviendaUrl)!} alt="Vivienda" className="h-16 rounded-md object-cover" />
            </a>
          )}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(e) => setFotoVivienda(e.target.files?.[0] ?? null)}
            className="text-xs w-full"
          />
        </div>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => guardar.mutate()}
          disabled={guardar.isPending}
          className="bg-emerald-600 text-white px-3 py-1.5 rounded-md text-xs font-medium hover:bg-emerald-700 disabled:opacity-50"
        >
          {guardar.isPending ? "Guardando..." : "Guardar detalle"}
        </button>
        {!yaTieneDetalle && (
          <button
            type="button"
            onClick={() => setAbierto(false)}
            className="bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-gray-100 px-3 py-1.5 rounded-md text-xs font-medium hover:bg-gray-300 dark:hover:bg-gray-500"
          >
            Cancelar
          </button>
        )}
      </div>
    </div>
  );
}
