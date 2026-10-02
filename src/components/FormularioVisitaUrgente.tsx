import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type ClienteMapaRed, type Empleado, type RespuestaVisitaUrgente } from "../api/client";
import { useToast } from "./ToastProvider";

const campoClase =
  "border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-2 py-1.5 text-sm w-full";

interface Props {
  cliente: ClienteMapaRed;
  onCerrar: () => void;
}

// Panel EN FLUJO (no un overlay position:fixed — ver memoria del proyecto
// sobre Modal.tsx sin pintarse en la máquina real de este usuario) para
// agendar una visita prioritaria sin salir del Mapa de Red: se abre al hacer
// clic en un cliente caído (ver MapaRedPage.tsx) y llama a POST
// /visitas/urgente, que crea la ruta de HOY del técnico si todavía no la
// tenía (ver comentario en backend/src/routes/visitas.ts).
export function FormularioVisitaUrgente({ cliente, onCerrar }: Props) {
  const { mostrarToast } = useToast();
  const [empleadoId, setEmpleadoId] = useState("");
  const [motivoVisita, setMotivoVisita] = useState(cliente.detalle);
  const [direccion, setDireccion] = useState("");
  const [enviando, setEnviando] = useState(false);

  const { data: empleados } = useQuery({
    queryKey: ["empleados-activos"],
    queryFn: async () => (await api.get<Empleado[]>("/empleados")).data.filter((e) => e.activo),
  });

  async function enviar() {
    if (!empleadoId) return;
    setEnviando(true);
    try {
      const { data } = await api.post<RespuestaVisitaUrgente>("/visitas/urgente", {
        empleadoId: Number(empleadoId),
        clienteId: cliente.id,
        motivoVisita: motivoVisita.trim() || null,
        direccion: direccion.trim() || null,
        latitud: Number(cliente.latitud),
        longitud: Number(cliente.longitud),
      });
      const empleado = empleados?.find((e) => e.id === Number(empleadoId));
      const nombreEmpleado = empleado ? `${empleado.nombres} ${empleado.apellidos}` : "el técnico";
      mostrarToast(
        data.rutaCreada
          ? `Se creó la ruta de hoy de ${nombreEmpleado} con esta visita prioritaria`
          : `Visita prioritaria agregada a la ruta de hoy de ${nombreEmpleado}`,
        "success"
      );
      onCerrar();
    } catch (error: any) {
      mostrarToast(error.response?.data?.error ?? "No se pudo crear la visita urgente");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-sm  border border-amber-300 dark:border-amber-700 p-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h3 className="font-mono text-[11px] uppercase tracking-[0.15em] text-gray-600 dark:text-gray-300">Crear visita técnica prioritaria</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {cliente.razonSocial} — {cliente.detalle}
          </p>
        </div>
        <button onClick={onCerrar} className="text-xs text-gray-500 dark:text-gray-400 hover:underline shrink-0">
          Cancelar
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Técnico *</label>
          <select value={empleadoId} onChange={(e) => setEmpleadoId(e.target.value)} className={campoClase}>
            <option value="">Seleccionar...</option>
            {empleados?.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nombres} {e.apellidos}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Dirección (opcional)</label>
          <input value={direccion} onChange={(e) => setDireccion(e.target.value)} className={campoClase} placeholder="Referencia para llegar" />
        </div>
        <div className="sm:col-span-2">
          <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Motivo de la visita</label>
          <textarea value={motivoVisita} onChange={(e) => setMotivoVisita(e.target.value)} rows={2} className={campoClase} />
        </div>
      </div>

      <div className="flex gap-2 mt-3">
        <button
          onClick={enviar}
          disabled={enviando || !empleadoId}
          className="bg-brand-700 text-white text-sm font-semibold px-4 py-2 rounded-md hover:bg-brand-800 disabled:opacity-50"
        >
          {enviando ? "Creando..." : "Crear visita prioritaria"}
        </button>
        <button
          onClick={onCerrar}
          className="border border-stone-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 text-sm font-medium px-4 py-2 rounded-md hover:bg-stone-50 dark:hover:bg-gray-700"
        >
          Cancelar
        </button>
      </div>
      <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
        Si el técnico todavía no tiene una ruta para hoy, se le crea una nueva con esta parada; si ya la tiene, se agrega al final marcada como
        urgente.
      </p>
    </div>
  );
}
