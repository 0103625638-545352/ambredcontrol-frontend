import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import { api, type Empleado, type VisitaHistorialTecnico, type VisitaHistorialCliente } from "../api/client";
import { BuscadorCliente } from "../components/BuscadorCliente";
import { TarjetaVisitaDetalle } from "../components/TarjetaVisitaDetalle";
import { useFiltrosListado, BarraBuscadorDocumentos, filtrarLocal, sinPaginacion } from "../components/BuscadorDocumentos";
import { CLASE_CAMPO, CLASE_ETIQUETA } from "../components/FormatoDocumento";

const ETIQUETA_ESTADO: Record<string, string> = {
  PENDIENTE: "Pendiente",
  COMPLETADA: "Completada",
  OMITIDA: "Omitida",
};

function ResumenConteo({ visitas }: { visitas: { estado: string }[] }) {
  const completadas = visitas.filter((v) => v.estado === "COMPLETADA").length;
  const omitidas = visitas.filter((v) => v.estado === "OMITIDA").length;
  const pendientes = visitas.length - completadas - omitidas;
  return (
    <div className="flex gap-4 text-xs text-gray-600 dark:text-gray-300 mb-3">
      <span>Total: <strong>{visitas.length}</strong></span>
      <span className="text-emerald-600 dark:text-emerald-400">Completadas: <strong>{completadas}</strong></span>
      <span className="text-red-600 dark:text-red-400">Omitidas: <strong>{omitidas}</strong></span>
      <span className="text-sky-600 dark:text-sky-400">Pendientes: <strong>{pendientes}</strong></span>
    </div>
  );
}

// Historial por técnico: elige un técnico + un rango de fechas opcional y ve
// todas sus visitas en ese rango, sin importar a cuál ruta/día pertenece
// cada una — a diferencia de "Rutas planificadas" (en Visitas Técnicas),
// que solo filtra por un día exacto.
function SeccionPorTecnico() {
  const [empleadoId, setEmpleadoId] = useState("");
  // Buscador compartido: Desde/Hasta van al servidor (como antes); el texto
  // y el estado filtran en el navegador lo que ya llegó.
  const filtros = useFiltrosListado(sinPaginacion);
  const { desde, hasta } = filtros;

  const { data: empleados } = useQuery({
    queryKey: ["empleados-activos"],
    queryFn: async () => (await api.get<Empleado[]>("/empleados")).data.filter((e) => e.activo),
  });

  const { data: visitas, isFetching } = useQuery({
    queryKey: ["historial-visitas-tecnico", empleadoId, desde, hasta],
    queryFn: async () =>
      (
        await api.get<VisitaHistorialTecnico[]>("/visitas/historial", {
          params: { empleadoId, desde: desde || undefined, hasta: hasta || undefined },
        })
      ).data,
    enabled: !!empleadoId,
  });
  const visitasFiltradas = filtrarLocal(visitas, filtros, {
    textos: (v) => [
      v.cliente?.razonSocial,
      v.cliente?.identificacion,
      v.nombreContacto,
      v.direccion,
      v.descripcionTrabajo,
      ...v.equiposDejados.flatMap((eq) => [eq.tipo, eq.modelo, eq.serial]),
    ],
    estado: (v) => v.estado,
  });

  function exportarExcel() {
    if (!visitas || visitas.length === 0) return;
    const empleado = empleados?.find((e) => String(e.id) === empleadoId);
    const filas = visitas.flatMap((v) => {
      const base = {
        Fecha: new Date(v.rutaVisita.fecha).toLocaleDateString("es-EC"),
        Cliente: v.cliente?.razonSocial ?? v.nombreContacto,
        Identificación: v.cliente?.identificacion ?? "",
        Estado: ETIQUETA_ESTADO[v.estado],
        Urgente: v.esUrgente ? "Sí" : "No",
        Dirección: v.direccion ?? "",
        Trabajo: v.descripcionTrabajo ?? "",
      };
      if (v.equiposDejados.length === 0) {
        return [{ ...base, "Equipo tipo": "", "Equipo modelo": "", "Equipo serial/MAC": "" }];
      }
      return v.equiposDejados.map((eq) => ({
        ...base,
        "Equipo tipo": eq.tipo,
        "Equipo modelo": eq.modelo ?? "",
        "Equipo serial/MAC": eq.serial ?? "",
      }));
    });
    const hoja = XLSX.utils.json_to_sheet(filas);
    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, hoja, "Visitas técnicas");
    XLSX.writeFile(libro, `historial-visitas-${empleado ? `${empleado.nombres}-${empleado.apellidos}` : "tecnico"}.xlsx`);
  }

  return (
    <div>
      <div className="-mx-4 mb-4 border-t border-stone-300 dark:border-gray-700">
        <BarraBuscadorDocumentos
          filtros={filtros}
          etiquetaBusqueda="Buscar en el historial · cliente, contacto, dirección, trabajo o serial"
          placeholder="Ej: Pérez, fibra rota, 48575443..."
          opcionesEstado={[
            { valor: "COMPLETADA", etiqueta: "Completada" },
            { valor: "PENDIENTE", etiqueta: "Pendiente" },
            { valor: "OMITIDA", etiqueta: "Omitida" },
          ]}
          mostrarPago={false}
          extras={
            <label className="flex flex-col gap-1 w-48">
              <span className={CLASE_ETIQUETA}>Técnico</span>
              <select value={empleadoId} onChange={(e) => setEmpleadoId(e.target.value)} className={CLASE_CAMPO}>
                <option value="">Elegir técnico...</option>
                {empleados?.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.nombres} {e.apellidos}
                  </option>
                ))}
              </select>
            </label>
          }
        />
      </div>

      {!empleadoId && <p className="text-sm text-gray-400 dark:text-gray-500">Elige un técnico para ver su historial.</p>}
      {empleadoId && isFetching && <p className="text-sm text-gray-400 dark:text-gray-500">Cargando...</p>}
      {empleadoId && !isFetching && visitasFiltradas?.length === 0 && (
        <p className="text-sm text-gray-400 dark:text-gray-500">
          {visitas?.length ? "Ninguna visita coincide con la búsqueda." : "Sin visitas en ese rango."}
        </p>
      )}
      {empleadoId && visitasFiltradas && visitasFiltradas.length > 0 && (
        <>
          <div className="flex justify-between items-center">
            <ResumenConteo visitas={visitasFiltradas} />
            <button
              onClick={exportarExcel}
              className="bg-brand-700 text-white px-3 py-1.5 rounded-md text-xs font-semibold hover:bg-brand-800 mb-3 h-fit"
            >
              Exportar a Excel
            </button>
          </div>
          <div className="space-y-3">
            {visitasFiltradas.map((v) => (
              <TarjetaVisitaDetalle
                key={v.id}
                visita={v}
                encabezado={
                  <>
                    {new Date(v.rutaVisita.fecha).toLocaleDateString("es-EC")} — {v.cliente?.razonSocial ?? v.nombreContacto}
                    {v.cliente && <span className="text-gray-400 dark:text-gray-500 ml-1 text-xs font-normal">({v.cliente.identificacion})</span>}
                  </>
                }
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// Historial por cliente — mismo dato que ya se ve en Clientes → Historial →
// "Visitas técnicas" (GET /clientes/:id/historial-visitas), repetido acá
// para no obligar a salir de esta pantalla cuando ya se está revisando
// técnicos y se quiere comparar contra un cliente puntual.
function SeccionPorCliente() {
  const [clienteId, setClienteId] = useState<number | "">("");
  const [nombreCliente, setNombreCliente] = useState("");
  // Buscador sobre las visitas del cliente elegido (en el navegador).
  const filtros = useFiltrosListado(sinPaginacion);

  const { data: visitas, isFetching } = useQuery({
    queryKey: ["historial-visitas-cliente", clienteId],
    queryFn: async () => (await api.get<VisitaHistorialCliente[]>(`/clientes/${clienteId}/historial-visitas`)).data,
    enabled: !!clienteId,
  });
  const visitasFiltradas = filtrarLocal(visitas, filtros, {
    textos: (v) => [
      v.rutaVisita.empleado.nombres,
      v.rutaVisita.empleado.apellidos,
      v.nombreContacto,
      v.direccion,
      v.descripcionTrabajo,
      ...v.equiposDejados.flatMap((eq) => [eq.tipo, eq.modelo, eq.serial]),
    ],
    estado: (v) => v.estado,
    fecha: (v) => v.rutaVisita.fecha,
  });

  function exportarExcel() {
    if (!visitas || visitas.length === 0) return;
    const filas = visitas.flatMap((v) => {
      const base = {
        Fecha: new Date(v.rutaVisita.fecha).toLocaleDateString("es-EC"),
        Técnico: `${v.rutaVisita.empleado.nombres} ${v.rutaVisita.empleado.apellidos}`,
        Estado: ETIQUETA_ESTADO[v.estado],
        Urgente: v.esUrgente ? "Sí" : "No",
        Dirección: v.direccion ?? "",
        Trabajo: v.descripcionTrabajo ?? "",
      };
      if (v.equiposDejados.length === 0) {
        return [{ ...base, "Equipo tipo": "", "Equipo modelo": "", "Equipo serial/MAC": "" }];
      }
      return v.equiposDejados.map((eq) => ({
        ...base,
        "Equipo tipo": eq.tipo,
        "Equipo modelo": eq.modelo ?? "",
        "Equipo serial/MAC": eq.serial ?? "",
      }));
    });
    const hoja = XLSX.utils.json_to_sheet(filas);
    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, hoja, "Visitas técnicas");
    XLSX.writeFile(libro, `historial-visitas-${nombreCliente || "cliente"}.xlsx`);
  }

  return (
    <div>
      <div className="max-w-md mb-4">
        <BuscadorCliente
          clienteId={clienteId}
          onSeleccionar={(id, cliente) => {
            setClienteId(id);
            setNombreCliente(cliente?.razonSocial ?? "");
          }}
        />
      </div>
      {clienteId && (
        <div className="-mx-4 mb-4 border-t border-stone-300 dark:border-gray-700">
          <BarraBuscadorDocumentos
            filtros={filtros}
            etiquetaBusqueda="Buscar en sus visitas · técnico, contacto, dirección, trabajo o serial"
            placeholder="Ej: fibra rota, 48575443..."
          opcionesEstado={[
              { valor: "COMPLETADA", etiqueta: "Completada" },
              { valor: "PENDIENTE", etiqueta: "Pendiente" },
              { valor: "OMITIDA", etiqueta: "Omitida" },
            ]}
            mostrarPago={false}
          />
        </div>
      )}

      {!clienteId && <p className="text-sm text-gray-400 dark:text-gray-500">Elige un cliente para ver cuántas visitas ha solicitado.</p>}
      {clienteId && isFetching && <p className="text-sm text-gray-400 dark:text-gray-500">Cargando...</p>}
      {clienteId && !isFetching && visitasFiltradas?.length === 0 && (
        <p className="text-sm text-gray-400 dark:text-gray-500">
          {visitas?.length ? "Ninguna visita coincide con la búsqueda." : "Este cliente todavía no ha recibido visitas técnicas."}
        </p>
      )}
      {clienteId && visitasFiltradas && visitasFiltradas.length > 0 && (
        <>
          <div className="flex justify-between items-center">
            <ResumenConteo visitas={visitasFiltradas} />
            <button
              onClick={exportarExcel}
              className="bg-brand-700 text-white px-3 py-1.5 rounded-md text-xs font-semibold hover:bg-brand-800 mb-3 h-fit"
            >
              Exportar a Excel
            </button>
          </div>
          <div className="space-y-3">
            {visitasFiltradas.map((v) => (
              <TarjetaVisitaDetalle
                key={v.id}
                visita={v}
                encabezado={
                  <>
                    {new Date(v.rutaVisita.fecha).toLocaleDateString("es-EC")} — {v.rutaVisita.empleado.nombres} {v.rutaVisita.empleado.apellidos}
                  </>
                }
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// Respaldo del historial de visitas técnicas: por técnico (con rango de
// fechas, para "¿qué hizo Fulano entre el 1 y el 15?") o por cliente
// (cuántas visitas/equipos ha recibido, ver también Clientes → Historial).
export function HistorialVisitasPage() {
  const [pestana, setPestana] = useState<"tecnico" | "cliente">("tecnico");

  return (
    <div>
      <h2 className="text-lg font-bold text-gray-900 dark:text-gray-50 mb-4">Historial de Visitas Técnicas</h2>

      <div className="bg-white dark:bg-gray-800 rounded-sm border border-stone-300 dark:border-gray-700 p-4">
        <div className="flex gap-4 border-b border-stone-300 dark:border-gray-700 mb-4">
          <button
            onClick={() => setPestana("tecnico")}
            className={`pb-2 text-sm font-medium border-b-2 -mb-px ${
              pestana === "tecnico"
                ? "border-brand-700 dark:border-brand-400 text-gray-800 dark:text-gray-100"
                : "border-transparent text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
            }`}
          >
            Por técnico
          </button>
          <button
            onClick={() => setPestana("cliente")}
            className={`pb-2 text-sm font-medium border-b-2 -mb-px ${
              pestana === "cliente"
                ? "border-brand-700 dark:border-brand-400 text-gray-800 dark:text-gray-100"
                : "border-transparent text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
            }`}
          >
            Por cliente
          </button>
        </div>

        {pestana === "tecnico" ? <SeccionPorTecnico /> : <SeccionPorCliente />}
      </div>
    </div>
  );
}
