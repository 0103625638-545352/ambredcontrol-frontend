import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  api,
  urlArchivoSubido,
  type VisitaTecnica,
  type ProductoCatalogoEquipo,
  type SerieDisponibleCatalogo,
  type RolloMetrajeDisponible,
  type EgresoPendienteTecnico,
  type TipoTrabajoVisita,
} from "../api/client";
import { useToast } from "./ToastProvider";

interface EquipoForm {
  key: string;
  tipo: string;
  modelo: string;
  serial: string;
  // Solo tiene valor si "serial" se eligió del select de bodega o del
  // buscador de "Mis equipos despachados" — ver FilaEquipoDejado /
  // BuscadorEquiposDespachados. null si se tipeó a mano.
  numeroSerieProductoId: number | null;
  // Igual criterio: solo tiene valor si el técnico eligió descontar metros
  // de uno de SUS rollos asignados (ver misRollos) — metrosUsados
  // (controlado como texto, se valida al guardar) va siempre junto.
  asignacionMetrajeId: number | null;
  metrosUsados: string;
}

function equipoVacio(): EquipoForm {
  return {
    key: `${Date.now()}-${Math.random()}`,
    tipo: "",
    modelo: "",
    serial: "",
    numeroSerieProductoId: null,
    asignacionMetrajeId: null,
    metrosUsados: "",
  };
}

interface MaterialForm {
  key: string;
  descripcion: string;
  cantidad: string;
  unidad: string;
}

function materialVacio(): MaterialForm {
  return { key: `${Date.now()}-${Math.random()}`, descripcion: "", cantidad: "1", unidad: "UNIDAD" };
}

const TIPOS_SUGERIDOS = ["Router Mikrotik", "ONU", "Cable UTP", "Splitter", "Conector"];
const UNIDADES_SUGERIDAS = ["UNIDAD", "METROS"];

const ETIQUETAS_TIPO_TRABAJO: Record<TipoTrabajoVisita, string> = {
  INSTALACION_NUEVA: "Instalación nueva",
  MEJORA_EXISTENTE: "Mejora / mantenimiento a cliente existente",
};

// Buscador de "lo que el técnico ya tiene en la mano" (ver GET
// /egresos-bodega/mis-pendientes — todo lo que bodega le despachó y sigue
// EN_TRANSITO, de cualquier egreso). En vez de tipear tipo/modelo a mano y
// esperar a que resuelva contra el catálogo, el técnico busca por modelo,
// producto, serie, o el cliente al que iba destinado el egreso, y un click
// carga la fila ya completa en "Equipos dejados".
function BuscadorEquiposDespachados({
  yaAgregados,
  onAgregar,
}: {
  yaAgregados: Set<number>;
  onAgregar: (item: EgresoPendienteTecnico) => void;
}) {
  const [busqueda, setBusqueda] = useState("");
  const { data: pendientes = [] } = useQuery({
    queryKey: ["egresos-bodega-mis-pendientes"],
    queryFn: async () => (await api.get<EgresoPendienteTecnico[]>("/egresos-bodega/mis-pendientes")).data,
  });

  const disponibles = pendientes.filter((p) => !yaAgregados.has(p.numeroSerieProducto.id));
  const termino = busqueda.trim().toLowerCase();
  const filtrados = !termino
    ? disponibles
    : disponibles.filter((p) => {
        const { producto } = p.numeroSerieProducto;
        const texto = [producto.nombre, producto.marca, producto.modelo, p.numeroSerieProducto.numeroSerie, p.egreso.clienteDestino?.razonSocial]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return texto.includes(termino);
      });

  if (pendientes.length === 0) return null;

  return (
    <div className="border border-slate-200 dark:border-brand-700 rounded-md p-2 mb-2 bg-stone-50 dark:bg-slate-900/40">
      <label className="block font-mono text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1">
        Mis equipos despachados (bodega te dio {pendientes.length}, quedan {disponibles.length} por asignar)
      </label>
      <input
        type="text"
        placeholder="Buscar por modelo, producto, serie o cliente del egreso..."
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        className="w-full border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-2 py-1 text-xs mb-1.5"
      />
      {filtrados.length === 0 ? (
        <p className="text-xs text-gray-400 dark:text-gray-500">
          {disponibles.length === 0 ? "Ya asignaste todo lo que tenías despachado." : "Nada coincide con la búsqueda."}
        </p>
      ) : (
        <div className="space-y-1 max-h-40 overflow-y-auto">
          {filtrados.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onAgregar(p)}
              className="w-full flex items-center justify-between gap-2 text-left text-xs bg-white dark:bg-gray-800 border border-stone-300 dark:border-gray-700 rounded-md px-2 py-1 hover:border-brand-500 dark:hover:border-brand-500"
            >
              <span className="truncate">
                <span className="font-medium">{p.numeroSerieProducto.producto.nombre}</span>
                {p.numeroSerieProducto.producto.modelo && <span className="text-gray-400"> {p.numeroSerieProducto.producto.modelo}</span>}
                <span className="font-mono text-gray-500 dark:text-gray-400"> — {p.numeroSerieProducto.numeroSerie}</span>
                {p.egreso.clienteDestino && <span className="text-gray-400"> (para {p.egreso.clienteDestino.razonSocial})</span>}
              </span>
              <span className="shrink-0 text-brand-600 dark:text-brand-400 font-medium">+ Agregar</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Busca en el catálogo real un producto cuyo nombre (y, si hay más de uno con
// el mismo nombre, también el modelo) coincida con lo que el técnico
// escribió — permite resolver el producto real detrás de "Tipo"/"Modelo" sin
// forzar al técnico a elegir de una lista rígida: sigue pudiendo tipear
// equipos que no están en el catálogo (ej. cable, conectores).
function resolverProducto(productos: ProductoCatalogoEquipo[], tipo: string, modelo: string): ProductoCatalogoEquipo | undefined {
  const tipoNorm = tipo.trim().toLowerCase();
  if (!tipoNorm) return undefined;
  const coincidencias = productos.filter((p) => p.nombre.trim().toLowerCase() === tipoNorm);
  if (coincidencias.length <= 1) return coincidencias[0];
  const modeloNorm = modelo.trim().toLowerCase();
  return coincidencias.find((p) => (p.modelo ?? "").trim().toLowerCase() === modeloNorm);
}

// Una fila del formulario de "Equipos dejados". Aparte para poder usar su
// propio useQuery de seriales EN_BODEGA solo cuando el tipo/modelo tipeados
// resuelven a un producto real que controla número de serie.
function FilaEquipoDejado({
  eq,
  productos,
  misRollos,
  onChange,
  onRemove,
}: {
  eq: EquipoForm;
  productos: ProductoCatalogoEquipo[];
  misRollos: RolloMetrajeDisponible[];
  onChange: (cambios: Partial<EquipoForm>) => void;
  onRemove: () => void;
}) {
  const productoResuelto = resolverProducto(productos, eq.tipo, eq.modelo);
  // Rollo(s) del técnico logueado para ESTE producto puntual — normalmente
  // uno solo (un técnico rara vez tiene dos rollos activos del mismo cable a
  // la vez), pero se soporta más de uno con un <select> si hiciera falta.
  const rollosDelProducto = productoResuelto ? misRollos.filter((r) => r.producto.id === productoResuelto.id) : [];

  const { data: series } = useQuery({
    queryKey: ["visitas-series-en-bodega", productoResuelto?.id],
    queryFn: async () =>
      (await api.get<SerieDisponibleCatalogo[]>(`/visitas/catalogo-equipos/${productoResuelto!.id}/series`)).data,
    enabled: !!productoResuelto?.controlaNumeroSerie,
  });

  const modelosSugeridos = productos.filter((p) => p.modelo && p.nombre.trim().toLowerCase() === eq.tipo.trim().toLowerCase());
  // El valor ya guardado (ej. de una acta anterior) puede no estar entre las
  // series EN_BODEGA de hoy (ya se entregó, o se cargó antes de existir este
  // catálogo) — se agrega igual como opción para no perderlo silenciosamente
  // al mostrar el <select>.
  const opcionesSerial =
    eq.serial && !series?.some((s) => s.numeroSerie === eq.serial)
      ? [{ id: eq.numeroSerieProductoId ?? -1, numeroSerie: eq.serial }, ...(series ?? [])]
      : series ?? [];

  return (
    <div className="space-y-1">
    {/* En pantallas angostas (celular) los 4 campos no caben en una sola fila
        sin achicarse hasta ser inservibles (o desbordar el viewport — ver el
        bug que esto arregló: en Android, el <select> de serial se salía de la
        pantalla y quedaba mal pintado en vez de solo recortado). Se apilan por
        defecto y recién en sm: (tablet/escritorio) pasan a una sola fila. */}
    <div className="flex flex-col gap-1.5 border border-stone-300 dark:border-gray-700 rounded-md p-2 sm:flex-row sm:items-center sm:border-0 sm:p-0">
      <input
        type="text"
        list="tipos-equipo-sugeridos"
        placeholder="Tipo (ej. Router Mikrotik)"
        value={eq.tipo}
        onChange={(e) => onChange({ tipo: e.target.value, serial: "", numeroSerieProductoId: null })}
        className="w-full sm:flex-1 sm:min-w-0 border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-2 py-1 text-xs"
      />
      <input
        type="text"
        list={`modelos-sugeridos-${eq.key}`}
        placeholder="Modelo (opcional)"
        value={eq.modelo}
        onChange={(e) => onChange({ modelo: e.target.value, serial: "", numeroSerieProductoId: null })}
        className="w-full sm:flex-1 sm:min-w-0 border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-2 py-1 text-xs"
      />
      <datalist id={`modelos-sugeridos-${eq.key}`}>
        {modelosSugeridos.map((p) => (
          <option key={p.id} value={p.modelo ?? ""} />
        ))}
      </datalist>
      {productoResuelto?.controlaNumeroSerie ? (
        <select
          value={eq.serial}
          onChange={(e) => {
            const numeroSerie = e.target.value;
            const elegida = opcionesSerial.find((s) => s.numeroSerie === numeroSerie);
            onChange({ serial: numeroSerie, numeroSerieProductoId: elegida ? elegida.id : null });
          }}
          className="w-full sm:flex-1 sm:min-w-0 border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-2 py-1 text-xs font-mono"
        >
          <option value="">Serial / MAC — elegir de bodega</option>
          {opcionesSerial.map((s) => (
            <option key={s.id} value={s.numeroSerie}>
              {s.numeroSerie}
            </option>
          ))}
        </select>
      ) : (
        <input
          type="text"
          placeholder="Serial / MAC (opcional)"
          value={eq.serial}
          onChange={(e) => onChange({ serial: e.target.value, numeroSerieProductoId: null })}
          className="w-full sm:flex-1 sm:min-w-0 border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-2 py-1 text-xs font-mono"
        />
      )}
      <button
        type="button"
        onClick={onRemove}
        className="self-end sm:self-auto text-red-500 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 text-xs px-1"
        title="Quitar"
      >
        ✕ <span className="sm:hidden">Quitar equipo</span>
      </button>
    </div>

    {rollosDelProducto.length > 0 && (
      <div className="flex flex-wrap items-center gap-1.5 pl-2">
        {rollosDelProducto.length > 1 ? (
          <select
            value={eq.asignacionMetrajeId ?? ""}
            onChange={(e) => onChange({ asignacionMetrajeId: e.target.value ? Number(e.target.value) : null, metrosUsados: "" })}
            className="border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-2 py-1 text-xs"
          >
            <option value="">No descontar de mi rollo</option>
            {rollosDelProducto.map((r) => (
              <option key={r.id} value={r.id}>
                Rollo (quedan {r.metrosRestantes}m)
              </option>
            ))}
          </select>
        ) : (
          <label className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
            <input
              type="checkbox"
              checked={eq.asignacionMetrajeId === rollosDelProducto[0].id}
              onChange={(e) => onChange({ asignacionMetrajeId: e.target.checked ? rollosDelProducto[0].id : null, metrosUsados: "" })}
            />
            Descontar de mi rollo (quedan {rollosDelProducto[0].metrosRestantes}m)
          </label>
        )}
        {eq.asignacionMetrajeId != null && (
          <input
            type="number"
            min={1}
            placeholder="Metros usados"
            value={eq.metrosUsados}
            onChange={(e) => onChange({ metrosUsados: e.target.value })}
            className="w-32 border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-2 py-1 text-xs"
          />
        )}
      </div>
    )}
    </div>
  );
}

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
      ? visita.equiposDejados.map((e) => ({
          key: String(e.id),
          tipo: e.tipo,
          modelo: e.modelo ?? "",
          serial: e.serial ?? "",
          numeroSerieProductoId: e.numeroSerieProductoId,
          asignacionMetrajeId: e.asignacionMetrajeId ?? null,
          metrosUsados: e.metrosUsados ? String(e.metrosUsados) : "",
        }))
      : []
  );
  const [materiales, setMateriales] = useState<MaterialForm[]>(
    visita.materialesUtilizados && visita.materialesUtilizados.length > 0
      ? visita.materialesUtilizados.map((m) => ({ key: String(m.id), descripcion: m.descripcion, cantidad: String(m.cantidad), unidad: m.unidad }))
      : []
  );
  const [tipoTrabajo, setTipoTrabajo] = useState<TipoTrabajoVisita | "">(visita.tipoTrabajo ?? "");
  const [fotoTrabajo, setFotoTrabajo] = useState<File | null>(null);
  const [fotoVivienda, setFotoVivienda] = useState<File | null>(null);

  // Catálogo real de productos, para que las filas de "Equipos dejados"
  // sugieran tipo/modelo y resuelvan el select de serial (ver
  // FilaEquipoDejado arriba) en vez de que el técnico tipee todo a mano.
  const { data: productosCatalogo = [] } = useQuery({
    queryKey: ["visitas-catalogo-equipos"],
    queryFn: async () => (await api.get<ProductoCatalogoEquipo[]>("/visitas/catalogo-equipos")).data,
    enabled: abierto,
    staleTime: 5 * 60 * 1000,
  });

  // Rollos de cable que el técnico logueado tiene activos (ver
  // MetrajePage.tsx / GET /metraje/mis-rollos) — alimenta el "Descontar de
  // mi rollo" de cada fila cuyo tipo/modelo resuelve a ese producto.
  const { data: misRollos = [] } = useQuery({
    queryKey: ["metraje-mis-rollos"],
    queryFn: async () => (await api.get<RolloMetrajeDisponible[]>("/metraje/mis-rollos")).data,
    enabled: abierto,
  });

  const guardar = useMutation({
    mutationFn: async () => {
      const formData = new FormData();
      formData.append("descripcionTrabajo", descripcion);
      if (tipoTrabajo) formData.append("tipoTrabajo", tipoTrabajo);
      formData.append(
        "equipos",
        JSON.stringify(
          equipos
            .filter((e) => e.tipo.trim())
            .map((e) => ({
              tipo: e.tipo.trim(),
              modelo: e.modelo.trim(),
              serial: e.serial.trim(),
              numeroSerieProductoId: e.numeroSerieProductoId ?? undefined,
              asignacionMetrajeId: e.asignacionMetrajeId ?? undefined,
              metrosUsados: e.asignacionMetrajeId && Number(e.metrosUsados) > 0 ? Number(e.metrosUsados) : undefined,
            }))
        )
      );
      formData.append(
        "materiales",
        JSON.stringify(
          materiales
            .filter((m) => m.descripcion.trim() && Number(m.cantidad) > 0)
            .map((m) => ({ descripcion: m.descripcion.trim(), cantidad: Number(m.cantidad), unidad: m.unidad.trim() || undefined }))
        )
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
      // Los seriales recién entregados/liberados no deben seguir mostrando
      // el estado de bodega que tenían antes de guardar.
      queryClient.invalidateQueries({ queryKey: ["visitas-series-en-bodega"] });
      queryClient.invalidateQueries({ queryKey: ["metraje-mis-rollos"] });
      queryClient.invalidateQueries({ queryKey: ["egresos-bodega-mis-pendientes"] });
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
        className="text-xs font-medium text-brand-700 dark:text-brand-300 hover:underline"
      >
        + Registrar detalle del trabajo (equipos dejados, fotos)
      </button>
    );
  }

  return (
    <div className="border border-stone-300 dark:border-gray-700 rounded-md p-3 mt-2 space-y-3">
      <div>
        <label className="block font-mono text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1">¿Qué trabajo se hizo?</label>
        <textarea
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
          placeholder="ej. Instalación de router, se dejó cableado nuevo hasta la sala"
          rows={2}
          className="w-full border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-2 py-1.5 text-sm"
        />
      </div>

      <div>
        <label className="block font-mono text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1">Tipo de trabajo</label>
        <div className="flex flex-col gap-1">
          {(Object.entries(ETIQUETAS_TIPO_TRABAJO) as [TipoTrabajoVisita, string][]).map(([valor, etiqueta]) => (
            <label key={valor} className="flex items-center gap-1.5 text-xs text-gray-700 dark:text-gray-300">
              <input type="radio" name="tipoTrabajo" checked={tipoTrabajo === valor} onChange={() => setTipoTrabajo(valor)} />
              {etiqueta}
            </label>
          ))}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-[10px] text-gray-500 dark:text-gray-400">Equipos dejados</label>
          <button
            type="button"
            onClick={() => setEquipos([...equipos, equipoVacio()])}
            className="text-xs font-medium text-brand-700 dark:text-brand-300 hover:underline"
          >
            + Agregar equipo
          </button>
        </div>
        <BuscadorEquiposDespachados
          yaAgregados={new Set(equipos.map((e) => e.numeroSerieProductoId).filter((v): v is number => v != null))}
          onAgregar={(p) =>
            setEquipos([
              ...equipos,
              {
                key: `${Date.now()}-${Math.random()}`,
                tipo: p.numeroSerieProducto.producto.nombre,
                modelo: p.numeroSerieProducto.producto.modelo ?? "",
                serial: p.numeroSerieProducto.numeroSerie,
                numeroSerieProductoId: p.numeroSerieProducto.id,
                asignacionMetrajeId: null,
                metrosUsados: "",
              },
            ])
          }
        />
        {equipos.length === 0 && <p className="text-xs text-gray-400 dark:text-gray-500">Ninguno agregado todavía.</p>}
        <div className="space-y-1.5">
          {equipos.map((eq) => (
            <FilaEquipoDejado
              key={eq.key}
              eq={eq}
              productos={productosCatalogo}
              misRollos={misRollos}
              onChange={(cambios) => setEquipos(equipos.map((x) => (x.key === eq.key ? { ...x, ...cambios } : x)))}
              onRemove={() => setEquipos(equipos.filter((x) => x.key !== eq.key))}
            />
          ))}
        </div>
        <datalist id="tipos-equipo-sugeridos">
          {[...new Set([...TIPOS_SUGERIDOS, ...productosCatalogo.map((p) => p.nombre)])].map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-[10px] text-gray-500 dark:text-gray-400">Materiales utilizados (cinta, canaleta, conectores, etc.)</label>
          <button
            type="button"
            onClick={() => setMateriales([...materiales, materialVacio()])}
            className="text-xs font-medium text-brand-700 dark:text-brand-300 hover:underline"
          >
            + Agregar material
          </button>
        </div>
        {materiales.length === 0 && <p className="text-xs text-gray-400 dark:text-gray-500">Ninguno agregado todavía.</p>}
        <div className="space-y-1.5">
          {materiales.map((m) => (
            <div key={m.key} className="flex flex-col gap-1.5 border border-stone-300 dark:border-gray-700 rounded-md p-2 sm:flex-row sm:items-center sm:border-0 sm:p-0">
              <input
                type="text"
                list="materiales-sugeridos"
                placeholder="Material (ej. Cinta aislante, Canaleta)"
                value={m.descripcion}
                onChange={(e) => setMateriales(materiales.map((x) => (x.key === m.key ? { ...x, descripcion: e.target.value } : x)))}
                className="w-full sm:flex-1 sm:min-w-0 border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-2 py-1 text-xs"
              />
              <input
                type="number"
                min={1}
                placeholder="Cantidad"
                value={m.cantidad}
                onChange={(e) => setMateriales(materiales.map((x) => (x.key === m.key ? { ...x, cantidad: e.target.value } : x)))}
                className="w-full sm:w-24 border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-2 py-1 text-xs"
              />
              <input
                type="text"
                list="unidades-sugeridas"
                placeholder="Unidad"
                value={m.unidad}
                onChange={(e) => setMateriales(materiales.map((x) => (x.key === m.key ? { ...x, unidad: e.target.value } : x)))}
                className="w-full sm:w-28 border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-2 py-1 text-xs"
              />
              <button
                type="button"
                onClick={() => setMateriales(materiales.filter((x) => x.key !== m.key))}
                className="self-end sm:self-auto text-red-500 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 text-xs px-1"
                title="Quitar"
              >
                ✕ <span className="sm:hidden">Quitar material</span>
              </button>
            </div>
          ))}
        </div>
        <datalist id="materiales-sugeridos">
          {["Cinta aislante", "Canaleta", "Conector RJ45", "Amarras", "Grapas", "Tornillos"].map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
        <datalist id="unidades-sugeridas">
          {UNIDADES_SUGERIDAS.map((u) => (
            <option key={u} value={u} />
          ))}
        </datalist>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block font-mono text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1">Foto del trabajo realizado</label>
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
          <label className="block font-mono text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1">Foto de la vivienda</label>
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
          onClick={() => {
            const filaIncompleta = equipos.find((e) => e.asignacionMetrajeId != null && !(Number(e.metrosUsados) > 0));
            if (filaIncompleta) {
              mostrarToast(`Falta indicar cuántos metros usaste en "${filaIncompleta.tipo}"`);
              return;
            }
            guardar.mutate();
          }}
          disabled={guardar.isPending}
          className="bg-brand-700 text-white px-3 py-1.5 rounded-md text-xs font-semibold hover:bg-brand-800 disabled:opacity-50"
        >
          {guardar.isPending ? "Guardando..." : "Guardar detalle"}
        </button>
        {!yaTieneDetalle && (
          <button
            type="button"
            onClick={() => setAbierto(false)}
            className="bg-stone-200 dark:bg-gray-600 text-gray-800 dark:text-gray-100 px-3 py-1.5 rounded-md text-xs font-medium hover:bg-gray-300 dark:hover:bg-gray-500"
          >
            Cancelar
          </button>
        )}
      </div>
    </div>
  );
}
