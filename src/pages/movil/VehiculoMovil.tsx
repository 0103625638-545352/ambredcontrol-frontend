import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Car, Fuel, Check, Camera, Wrench, TriangleAlert } from "lucide-react";
import {
  api,
  ETIQUETAS_MANTENIMIENTO_VEHICULO,
  type Vehiculo,
  type UsoVehiculo,
  type PlanMantenimientoVehiculo,
  type AlertaMantenimientoVehiculo,
  type TipoMantenimientoVehiculo,
} from "../../api/client";
import { useToast } from "../../components/ToastProvider";
import { CAMPOS_CHECKLIST_ENTREGA } from "../../constants/checklistVehiculo";

const TIPOS_MANTENIMIENTO: TipoMantenimientoVehiculo[] = [
  "CAMBIO_ACEITE",
  "CAMBIO_FILTRO_ACEITE",
  "CAMBIO_FILTRO_AIRE",
  "CAMBIO_PASTILLAS_FRENO",
  "CAMBIO_LLANTAS",
  "ALINEACION_BALANCEO",
  "REVISION_GENERAL",
  "OTRO",
];

interface MiActualRespuesta {
  uso: UsoVehiculo | null;
  planesMantenimiento: PlanMantenimientoVehiculo[];
  alertasMantenimiento: AlertaMantenimientoVehiculo[];
}

const CAMPO =
  "w-full border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-2 py-1.5.5 text-base";

// Pantalla "Vehículo" del shell móvil: el técnico no tiene un vehículo fijo
// — cada día elige cuál va a usar, anota el kilometraje con el que arranca,
// y al terminar cierra el día con el kilometraje final (ver UsoVehiculo en
// backend/prisma/schema.prisma, mismo patrón de apertura/cierre que
// CajaSesion pero para un vehículo). La carga de combustible es un registro
// aparte y opcional: no todos los días se pasa por la gasolinera. Todo EN
// FLUJO (no <Modal>, que usa position:fixed) — ver la nota de memoria sobre
// overlays fixed que a veces no pintan en la máquina del usuario.
export function VehiculoMovil() {
  const { data, isLoading } = useQuery({
    queryKey: ["mi-uso-vehiculo"],
    queryFn: async () => (await api.get<MiActualRespuesta>("/vehiculos/uso/mi-actual")).data,
  });

  if (isLoading) {
    return <p className="text-center text-sm text-gray-400 dark:text-gray-500 py-8">Cargando...</p>;
  }

  return data?.uso ? (
    <VehiculoEnUso uso={data.uso} planesMantenimiento={data.planesMantenimiento} alertasMantenimiento={data.alertasMantenimiento} />
  ) : (
    <ElegirVehiculo />
  );
}

const CHECKLIST_ENTREGA_VACIO = {
  golpesCarroceria: "",
  vidrios: "",
  llantas: "",
  lucesVisibles: "",
  accesorios: "",
  llaves: "",
  documentacion: "",
  equiposHerramientas: "",
};

function ElegirVehiculo() {
  const queryClient = useQueryClient();
  const { mostrarToast } = useToast();
  const [vehiculoId, setVehiculoId] = useState<number | null>(null);
  const [kilometraje, setKilometraje] = useState("");
  const [checklist, setChecklist] = useState(CHECKLIST_ENTREGA_VACIO);

  const { data: disponibles, isLoading } = useQuery({
    queryKey: ["vehiculos-disponibles"],
    queryFn: async () => (await api.get<Vehiculo[]>("/vehiculos/uso/disponibles")).data,
  });

  const abrir = useMutation({
    mutationFn: async () =>
      api.post("/vehiculos/uso/abrir", { vehiculoId, kilometrajeInicial: Number(kilometraje), ...checklist }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mi-uso-vehiculo"] });
      queryClient.invalidateQueries({ queryKey: ["vehiculos-disponibles"] });
      mostrarToast("Vehículo tomado — buen día de trabajo", "success");
    },
    onError: (err: any) => {
      mostrarToast(err.response?.data?.error ?? "No se pudo tomar el vehículo");
      queryClient.invalidateQueries({ queryKey: ["vehiculos-disponibles"] });
    },
  });

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-gray-800 border border-stone-300 dark:border-gray-700 rounded-sm p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-3">
          Elegí tu vehículo de hoy
        </p>

        {isLoading && <p className="text-sm text-gray-400 dark:text-gray-500">Cargando...</p>}
        {!isLoading && disponibles?.length === 0 && (
          <p className="text-sm text-gray-500 dark:text-gray-400">No hay vehículos libres ahora mismo.</p>
        )}

        <div className="space-y-2">
          {disponibles?.map((v) => (
            <button
              key={v.id}
              onClick={() => setVehiculoId(v.id)}
              className={`w-full text-left border rounded-sm p-3 flex items-center gap-3 ${
                vehiculoId === v.id
                  ? "border-brand-600 dark:border-brand-500 bg-brand-50 dark:bg-brand-900/20"
                  : "border-stone-300 dark:border-gray-700"
              }`}
            >
              <Car className="w-5 h-5 text-gray-400 dark:text-gray-500 shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">{v.placa}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                  {v.marca.nombre} {v.modelo.nombre}
                  {v.color ? ` — ${v.color}` : ""}
                </p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {vehiculoId !== null && (
        <div className="bg-white dark:bg-gray-800 border border-stone-300 dark:border-gray-700 rounded-sm p-4">
          <label className="block font-mono text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1">Kilometraje inicial (odómetro)</label>
          <input
            type="number"
            inputMode="numeric"
            min="0"
            autoFocus
            value={kilometraje}
            onChange={(e) => setKilometraje(e.target.value)}
            className={CAMPO}
            placeholder="Ej. 125480"
          />
        </div>
      )}

      {vehiculoId !== null && (
        <div className="bg-white dark:bg-gray-800 border border-stone-300 dark:border-gray-700 rounded-sm p-4 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
            Estado del vehículo al recibirlo
          </p>
          {CAMPOS_CHECKLIST_ENTREGA.map((campo) => (
            <div key={campo.clave}>
              <label className="block font-mono text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1">{campo.etiqueta}</label>
              <input
                value={checklist[campo.clave]}
                onChange={(e) => setChecklist({ ...checklist, [campo.clave]: e.target.value })}
                placeholder={campo.placeholder}
                className={CAMPO}
              />
            </div>
          ))}
        </div>
      )}

      {vehiculoId !== null && (
        <button
          onClick={() => abrir.mutate()}
          disabled={!kilometraje || abrir.isPending}
          className="w-full bg-brand-700 text-white rounded-sm p-3.5 text-sm font-semibold disabled:opacity-50"
        >
          {abrir.isPending ? "Guardando..." : "Empezar el día con este vehículo"}
        </button>
      )}
    </div>
  );
}

function VehiculoEnUso({
  uso,
  planesMantenimiento,
  alertasMantenimiento,
}: {
  uso: UsoVehiculo;
  planesMantenimiento: PlanMantenimientoVehiculo[];
  alertasMantenimiento: AlertaMantenimientoVehiculo[];
}) {
  const [mostrarCombustible, setMostrarCombustible] = useState(false);
  const [mostrarMantenimiento, setMostrarMantenimiento] = useState(false);
  const [mostrarCierre, setMostrarCierre] = useState(false);
  const sinFormularioAbierto = !mostrarCombustible && !mostrarMantenimiento && !mostrarCierre;

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-gray-800 border border-stone-300 dark:border-gray-700 rounded-sm p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-2">Tu vehículo hoy</p>
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-full bg-brand-50 dark:bg-brand-900/30 flex items-center justify-center shrink-0">
            <Car className="w-5 h-5 text-brand-700 dark:text-brand-300" />
          </div>
          <div className="min-w-0">
            <p className="text-base font-semibold text-gray-800 dark:text-gray-100">{uso.vehiculo.placa}</p>
            <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
              {uso.vehiculo.marca.nombre} {uso.vehiculo.modelo.nombre}
            </p>
          </div>
        </div>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-3">
          Km inicial: {uso.kilometrajeInicial.toLocaleString("es-EC")} · desde las{" "}
          {new Date(uso.fechaInicio).toLocaleTimeString("es-EC", { hour: "2-digit", minute: "2-digit" })}
        </p>

        {CAMPOS_CHECKLIST_ENTREGA.some((c) => uso[c.clave]) && (
          <details className="mt-3">
            <summary className="text-xs font-medium text-brand-700 dark:text-brand-300 cursor-pointer">
              Ver estado del vehículo registrado al recibirlo
            </summary>
            <div className="mt-2 space-y-1">
              {CAMPOS_CHECKLIST_ENTREGA.filter((c) => uso[c.clave]).map((c) => (
                <p key={c.clave} className="text-xs text-gray-500 dark:text-gray-400">
                  <span className="font-medium text-gray-600 dark:text-gray-300">{c.etiqueta}:</span> {uso[c.clave]}
                </p>
              ))}
            </div>
          </details>
        )}
      </div>

      {alertasMantenimiento.length > 0 && sinFormularioAbierto && (
        <div className="rounded-sm border border-amber-200 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-900/15 p-3 space-y-1.5">
          <p className="text-xs font-semibold text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
            <TriangleAlert className="w-3.5 h-3.5" /> Recordatorio de mantenimiento
          </p>
          {alertasMantenimiento.map((a) => (
            <p key={a.tipo} className="text-xs text-amber-800 dark:text-amber-300">
              {ETIQUETAS_MANTENIMIENTO_VEHICULO[a.tipo]}:{" "}
              <span className="font-semibold">
                {a.estado === "VENCIDO" ? `vencido hace ${Math.abs(a.kmRestantes).toLocaleString("es-EC")} km` : `faltan ${a.kmRestantes.toLocaleString("es-EC")} km`}
              </span>
            </p>
          ))}
        </div>
      )}

      {sinFormularioAbierto && (
        <div className="space-y-3">
          <button
            onClick={() => setMostrarCombustible(true)}
            className="w-full flex items-center justify-center gap-2 bg-white dark:bg-gray-800 border border-stone-300 dark:border-gray-700 rounded-sm p-3.5 text-sm font-medium text-gray-700 dark:text-gray-200"
          >
            <Fuel className="w-4 h-4" /> Registrar carga de combustible
          </button>
          <button
            onClick={() => setMostrarMantenimiento(true)}
            className="w-full flex items-center justify-center gap-2 bg-white dark:bg-gray-800 border border-stone-300 dark:border-gray-700 rounded-sm p-3.5 text-sm font-medium text-gray-700 dark:text-gray-200"
          >
            <Wrench className="w-4 h-4" /> Registrar mantenimiento
          </button>
          <button
            onClick={() => setMostrarCierre(true)}
            className="w-full flex items-center justify-center gap-2 bg-brand-700 text-white rounded-sm p-3.5 text-sm font-semibold"
          >
            <Check className="w-4 h-4" /> Finalizar el día
          </button>
        </div>
      )}

      {mostrarCombustible && (
        <FormularioCargaCombustibleMovil vehiculoId={uso.vehiculoId} onListo={() => setMostrarCombustible(false)} />
      )}

      {mostrarMantenimiento && (
        <FormularioMantenimientoMovil
          vehiculoId={uso.vehiculoId}
          planesMantenimiento={planesMantenimiento}
          onListo={() => setMostrarMantenimiento(false)}
        />
      )}

      {mostrarCierre && <FormularioCierreMovil uso={uso} onListo={() => setMostrarCierre(false)} />}
    </div>
  );
}

// Registro de carga de combustible desde el celular — mismo endpoint que
// usa el panel de escritorio (POST /vehiculos/:id/cargas-combustible), que
// acepta cualquier autenticado (no exige el permiso "vehiculos_editar").
function FormularioCargaCombustibleMovil({ vehiculoId, onListo }: { vehiculoId: number; onListo: () => void }) {
  const queryClient = useQueryClient();
  const { mostrarToast } = useToast();
  const [kilometraje, setKilometraje] = useState("");
  const [tipoCombustible, setTipoCombustible] = useState("Extra");
  const [galones, setGalones] = useState("");
  const [costoTotal, setCostoTotal] = useState("");
  const [gasolinera, setGasolinera] = useState("");
  const [comprobante, setComprobante] = useState<File | null>(null);
  const [previewComprobante, setPreviewComprobante] = useState<string | null>(null);

  function elegirComprobante(archivo: File | null) {
    if (previewComprobante) URL.revokeObjectURL(previewComprobante);
    setComprobante(archivo);
    setPreviewComprobante(archivo ? URL.createObjectURL(archivo) : null);
  }

  const registrar = useMutation({
    mutationFn: async () => {
      const formData = new FormData();
      formData.append("kilometraje", kilometraje);
      formData.append("tipoCombustible", tipoCombustible);
      formData.append("galones", galones);
      formData.append("costoTotal", costoTotal);
      if (gasolinera) formData.append("gasolinera", gasolinera);
      if (comprobante) formData.append("comprobante", comprobante);
      return api.post(`/vehiculos/${vehiculoId}/cargas-combustible`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vehiculos"] });
      // El kilometraje que se acaba de cargar puede cambiar los avisos de
      // mantenimiento que se muestran en esta misma pantalla.
      queryClient.invalidateQueries({ queryKey: ["mi-uso-vehiculo"] });
      mostrarToast("Carga de combustible registrada", "success");
      onListo();
    },
    onError: (err: any) => mostrarToast(err.response?.data?.error ?? "No se pudo registrar la carga"),
  });

  const valido = kilometraje !== "" && galones !== "" && costoTotal !== "";

  return (
    <div className="bg-white dark:bg-gray-800 border border-stone-300 dark:border-gray-700 rounded-sm p-4 space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">Carga de combustible</p>

      <div>
        <label className="block font-mono text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1">Kilometraje actual</label>
        <input
          type="number"
          inputMode="numeric"
          min="0"
          autoFocus
          value={kilometraje}
          onChange={(e) => setKilometraje(e.target.value)}
          className={CAMPO}
        />
      </div>
      <div>
        <label className="block font-mono text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1">Combustible</label>
        <input list="tipos-combustible-movil" value={tipoCombustible} onChange={(e) => setTipoCombustible(e.target.value)} className={CAMPO} />
        <datalist id="tipos-combustible-movil">
          <option value="Extra" />
          <option value="Súper" />
          <option value="Ecopaís" />
          <option value="Diésel Premium" />
          <option value="Diésel 2" />
        </datalist>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block font-mono text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1">Galones</label>
          <input type="number" inputMode="decimal" step="0.01" min="0.01" value={galones} onChange={(e) => setGalones(e.target.value)} className={CAMPO} />
        </div>
        <div>
          <label className="block font-mono text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1">Costo ($)</label>
          <input type="number" inputMode="decimal" step="0.01" min="0.01" value={costoTotal} onChange={(e) => setCostoTotal(e.target.value)} className={CAMPO} />
        </div>
      </div>
      <div>
        <label className="block font-mono text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1">Gasolinera (opcional)</label>
        <input value={gasolinera} onChange={(e) => setGasolinera(e.target.value)} className={CAMPO} />
      </div>
      <div>
        <label className="block font-mono text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1">Foto del comprobante (opcional)</label>
        {previewComprobante ? (
          <div className="flex items-center gap-3">
            <img src={previewComprobante} alt="Comprobante" className="w-16 h-16 rounded-md object-cover border border-stone-300 dark:border-gray-700" />
            <button type="button" onClick={() => elegirComprobante(null)} className="text-xs font-medium text-red-600 dark:text-red-400">
              Quitar foto
            </button>
          </div>
        ) : (
          <label className="flex items-center justify-center gap-2 w-full border border-dashed border-stone-300 dark:border-gray-600 rounded-md py-3 text-sm text-gray-500 dark:text-gray-400">
            <Camera className="w-4 h-4" /> Tomar foto del comprobante
            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(e) => elegirComprobante(e.target.files?.[0] ?? null)}
              className="hidden"
            />
          </label>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 pt-1">
        <button
          onClick={onListo}
          className="w-full bg-stone-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-sm p-3 text-sm font-medium"
        >
          Cancelar
        </button>
        <button
          onClick={() => registrar.mutate()}
          disabled={!valido || registrar.isPending}
          className="w-full bg-brand-700 text-white rounded-sm p-3 text-sm font-semibold disabled:opacity-50"
        >
          {registrar.isPending ? "Guardando..." : "Guardar"}
        </button>
      </div>
    </div>
  );
}

const mantenimientoFormVacio = { tipo: "CAMBIO_ACEITE" as TipoMantenimientoVehiculo, kilometraje: "", costo: "", taller: "", descripcion: "", numeroFactura: "" };

// Registro de mantenimiento desde el celular — mismo endpoint que usa el
// panel de escritorio (POST /vehiculos/:id/mantenimientos), abierto a
// cualquier autenticado igual que la carga de combustible. Si el tipo
// elegido tiene un plan configurado (ver planesMantenimiento, viene de GET
// /vehiculos/uso/mi-actual), el "próximo" se calcula solo en el backend al
// guardar — acá solo se muestra el cálculo como vista previa.
function FormularioMantenimientoMovil({
  vehiculoId,
  planesMantenimiento,
  onListo,
}: {
  vehiculoId: number;
  planesMantenimiento: PlanMantenimientoVehiculo[];
  onListo: () => void;
}) {
  const queryClient = useQueryClient();
  const { mostrarToast } = useToast();
  const [form, setForm] = useState(mantenimientoFormVacio);
  const [comprobante, setComprobante] = useState<File | null>(null);
  const [previewComprobante, setPreviewComprobante] = useState<string | null>(null);

  const planDelTipo = planesMantenimiento.find((p) => p.tipo === form.tipo);

  function elegirComprobante(archivo: File | null) {
    if (previewComprobante) URL.revokeObjectURL(previewComprobante);
    setComprobante(archivo);
    setPreviewComprobante(archivo ? URL.createObjectURL(archivo) : null);
  }

  const registrar = useMutation({
    mutationFn: async () => {
      const formData = new FormData();
      formData.append("tipo", form.tipo);
      formData.append("kilometraje", form.kilometraje);
      if (form.costo) formData.append("costo", form.costo);
      if (form.taller) formData.append("taller", form.taller);
      if (form.descripcion) formData.append("descripcion", form.descripcion);
      if (form.numeroFactura) formData.append("numeroFactura", form.numeroFactura);
      if (comprobante) formData.append("comprobante", comprobante);
      return api.post(`/vehiculos/${vehiculoId}/mantenimientos`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vehiculos"] });
      queryClient.invalidateQueries({ queryKey: ["mi-uso-vehiculo"] });
      mostrarToast("Mantenimiento registrado", "success");
      onListo();
    },
    onError: (err: any) => mostrarToast(err.response?.data?.error ?? "No se pudo registrar el mantenimiento"),
  });

  const valido = form.kilometraje !== "" && (form.tipo !== "OTRO" || form.descripcion.trim() !== "");

  return (
    <div className="bg-white dark:bg-gray-800 border border-stone-300 dark:border-gray-700 rounded-sm p-4 space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">Registrar mantenimiento</p>

      <div>
        <label className="block font-mono text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1">Tipo</label>
        <select
          autoFocus
          value={form.tipo}
          onChange={(e) => setForm({ ...form, tipo: e.target.value as TipoMantenimientoVehiculo })}
          className={CAMPO}
        >
          {TIPOS_MANTENIMIENTO.map((t) => (
            <option key={t} value={t}>{ETIQUETAS_MANTENIMIENTO_VEHICULO[t]}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="block font-mono text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1">Kilometraje actual</label>
        <input
          type="number"
          inputMode="numeric"
          min="0"
          value={form.kilometraje}
          onChange={(e) => setForm({ ...form, kilometraje: e.target.value })}
          className={CAMPO}
        />
        {planDelTipo && form.kilometraje && (
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
            Próximo cambio calculado a los {(Number(form.kilometraje) + planDelTipo.intervaloKm).toLocaleString("es-EC")} km
          </p>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block font-mono text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1">Costo (opcional)</label>
          <input type="number" inputMode="decimal" step="0.01" min="0" value={form.costo} onChange={(e) => setForm({ ...form, costo: e.target.value })} className={CAMPO} />
        </div>
        <div>
          <label className="block font-mono text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1">Taller (opcional)</label>
          <input value={form.taller} onChange={(e) => setForm({ ...form, taller: e.target.value })} className={CAMPO} />
        </div>
      </div>
      <div>
        <label className="block font-mono text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1">
          Descripción {form.tipo === "OTRO" && <span className="text-red-500">(obligatoria para "Otro")</span>}
        </label>
        <input value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} className={CAMPO} />
      </div>
      <div>
        <label className="block font-mono text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1">N° de factura (opcional)</label>
        <input value={form.numeroFactura} onChange={(e) => setForm({ ...form, numeroFactura: e.target.value })} className={CAMPO} />
      </div>
      <div>
        <label className="block font-mono text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1">Foto del comprobante (opcional)</label>
        {previewComprobante ? (
          <div className="flex items-center gap-3">
            <img src={previewComprobante} alt="Comprobante" className="w-16 h-16 rounded-md object-cover border border-stone-300 dark:border-gray-700" />
            <button type="button" onClick={() => elegirComprobante(null)} className="text-xs font-medium text-red-600 dark:text-red-400">
              Quitar foto
            </button>
          </div>
        ) : (
          <label className="flex items-center justify-center gap-2 w-full border border-dashed border-stone-300 dark:border-gray-600 rounded-md py-3 text-sm text-gray-500 dark:text-gray-400">
            <Camera className="w-4 h-4" /> Tomar foto del comprobante
            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(e) => elegirComprobante(e.target.files?.[0] ?? null)}
              className="hidden"
            />
          </label>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 pt-1">
        <button
          onClick={onListo}
          className="w-full bg-stone-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-sm p-3 text-sm font-medium"
        >
          Cancelar
        </button>
        <button
          onClick={() => registrar.mutate()}
          disabled={!valido || registrar.isPending}
          className="w-full bg-brand-700 text-white rounded-sm p-3 text-sm font-semibold disabled:opacity-50"
        >
          {registrar.isPending ? "Guardando..." : "Guardar"}
        </button>
      </div>
    </div>
  );
}

// Cierre del día — pide el kilometraje final y cierra el UsoVehiculo (PATCH
// /vehiculos/uso/:id/cerrar), liberando el vehículo para que otro técnico
// pueda tomarlo mañana.
function FormularioCierreMovil({ uso, onListo }: { uso: UsoVehiculo; onListo: () => void }) {
  const queryClient = useQueryClient();
  const { mostrarToast } = useToast();
  const [kilometrajeFinal, setKilometrajeFinal] = useState("");

  const cerrar = useMutation({
    mutationFn: async () => api.patch(`/vehiculos/uso/${uso.id}/cerrar`, { kilometrajeFinal: Number(kilometrajeFinal) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mi-uso-vehiculo"] });
      queryClient.invalidateQueries({ queryKey: ["vehiculos"] });
      mostrarToast("Día cerrado — que descanses", "success");
      onListo();
    },
    onError: (err: any) => mostrarToast(err.response?.data?.error ?? "No se pudo cerrar el día"),
  });

  const kmRecorridos = kilometrajeFinal !== "" ? Number(kilometrajeFinal) - uso.kilometrajeInicial : null;

  return (
    <div className="bg-white dark:bg-gray-800 border border-stone-300 dark:border-gray-700 rounded-sm p-4 space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">Finalizar el día</p>

      <div>
        <label className="block font-mono text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1">Kilometraje final (odómetro)</label>
        <input
          type="number"
          inputMode="numeric"
          min={uso.kilometrajeInicial}
          autoFocus
          value={kilometrajeFinal}
          onChange={(e) => setKilometrajeFinal(e.target.value)}
          className={CAMPO}
          placeholder={`Mayor a ${uso.kilometrajeInicial.toLocaleString("es-EC")}`}
        />
        {kmRecorridos !== null && kmRecorridos >= 0 && (
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{kmRecorridos.toLocaleString("es-EC")} km recorridos hoy</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 pt-1">
        <button
          onClick={onListo}
          className="w-full bg-stone-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-sm p-3 text-sm font-medium"
        >
          Cancelar
        </button>
        <button
          onClick={() => cerrar.mutate()}
          disabled={!kilometrajeFinal || Number(kilometrajeFinal) < uso.kilometrajeInicial || cerrar.isPending}
          className="w-full bg-brand-700 text-white rounded-sm p-3 text-sm font-semibold disabled:opacity-50"
        >
          {cerrar.isPending ? "Guardando..." : "Confirmar cierre"}
        </button>
      </div>
    </div>
  );
}
