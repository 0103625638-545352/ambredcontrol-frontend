import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Wifi, FileText, Upload, AlertTriangle, LogOut, CheckCircle2, Clock, Download } from "lucide-react";
import { api, apiPortal, type EmpresaResumen } from "../api/client";
import { MarcaAmbross } from "../components/MarcaAmbross";
import { useTema } from "../hooks/useTema";
import { BotonTema } from "../components/BotonTema";

// Portal del cliente de internet — público, se abre en /portal/<empresaId>
// (ver main.tsx). El cliente entra con su cédula/RUC y los últimos 4 dígitos
// de su teléfono; ve su plan, si está al día, sus facturas, y puede enviar
// un comprobante de transferencia o reportar una falla. Ambos entran como
// tickets de soporte para el personal. Ver backend/src/routes/portal.ts.

interface DatosPortal {
  nombre: string;
  identificacion: string;
  direccion: string | null;
  empresa: string;
  plan: { nombre: string; bajada: string; subida: string; precio: string } | null;
  pago: { estado: "AL_DIA" | "PENDIENTE" | "VENCIDO" | "SIN_PLAN"; fechaLimite: string | null; monto: string | null };
  facturas: { id: number; numero: string; fecha: string; total: string; saldo: string; estadoPago: string; tienePdf: boolean }[];
  tickets: { id: number; asunto: string; estado: string; createdAt: string; fechaResolucion: string | null; solucion: string | null }[];
}

const CLASE_CAMPO =
  "w-full border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm px-3 py-2.5 text-base focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600";
const CLASE_BOTON = "w-full bg-brand-700 hover:bg-brand-800 disabled:opacity-50 text-white font-semibold px-4 py-3 rounded-sm";
const CLASE_TARJETA = "bg-white dark:bg-gray-800 border border-stone-300 dark:border-gray-700 rounded-sm p-4";

const ESTADO_TICKET: Record<string, string> = { ABIERTO: "Recibido", EN_PROCESO: "En atención", RESUELTO: "Resuelto", CANCELADO: "Cerrado" };

function leerToken(): string | null {
  try {
    return sessionStorage.getItem("tokenPortal");
  } catch {
    return null;
  }
}
function guardarToken(token: string | null) {
  try {
    if (token) sessionStorage.setItem("tokenPortal", token);
    else sessionStorage.removeItem("tokenPortal");
  } catch {
    // sin sessionStorage la sesión dura solo mientras la página esté abierta
  }
}

function fechaCorta(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString("es-EC", { day: "numeric", month: "long", year: "numeric" }) : "—";
}

function mensajeError(error: any, porDefecto: string): string {
  return error?.response?.data?.error ?? porDefecto;
}

export function PortalClientePage({ empresaIdInicial }: { empresaIdInicial: string | null }) {
  const { tema, alternarTema } = useTema();
  const [token, setToken] = useState<string | null>(leerToken());

  // Sin empresa en la URL: si el servidor tiene una sola, se usa esa.
  const { data: empresas } = useQuery({
    queryKey: ["portal-empresas"],
    queryFn: async () => (await api.get<EmpresaResumen[]>("/auth/empresas")).data,
    enabled: !empresaIdInicial,
  });
  const empresaId = empresaIdInicial ?? (empresas?.length === 1 ? empresas[0].id : null);

  function salir() {
    guardarToken(null);
    setToken(null);
  }

  return (
    <div className="min-h-screen bg-stone-100 dark:bg-gray-950 text-gray-900 dark:text-gray-100">
      <header className="bg-brand-900 text-white px-4 py-3 flex items-center justify-between">
        <MarcaAmbross />
        <div className="flex items-center gap-2">
          <BotonTema tema={tema} onAlternar={alternarTema} className="text-brand-200 hover:text-white p-1.5" />
          {token && (
            <button onClick={salir} className="flex items-center gap-1 text-sm text-brand-200 hover:text-white" aria-label="Salir">
              <LogOut className="w-4 h-4" /> Salir
            </button>
          )}
        </div>
      </header>
      <main className="max-w-xl mx-auto px-4 py-6">
        {token ? (
          <Panel onSesionVencida={salir} />
        ) : empresaId ? (
          <Ingreso empresaId={empresaId} onIngresar={(t) => { guardarToken(t); setToken(t); }} />
        ) : empresas && empresas.length > 1 ? (
          <div className={CLASE_TARJETA}>
            <p className="mb-3">Elige tu proveedor de internet:</p>
            <div className="grid gap-2">
              {empresas.map((e) => (
                <a key={e.id} href={`/portal/${e.id}`} className="block border border-stone-300 dark:border-gray-600 px-3 py-2 rounded-sm hover:bg-stone-50 dark:hover:bg-gray-700">
                  {e.nombre}
                </a>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-center text-gray-500">Cargando...</p>
        )}
      </main>
    </div>
  );
}

function Ingreso({ empresaId, onIngresar }: { empresaId: string; onIngresar: (token: string) => void }) {
  const [identificacion, setIdentificacion] = useState("");
  const [ultimos4, setUltimos4] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data: empresa } = useQuery({
    queryKey: ["portal-empresa", empresaId],
    queryFn: async () => (await apiPortal.get<{ id: string; nombre: string }>(`/${empresaId}/empresa`)).data,
  });

  const ingresar = useMutation({
    mutationFn: async () => (await apiPortal.post<{ token: string }>(`/${empresaId}/ingresar`, { identificacion, ultimos4 })).data,
    onSuccess: (r) => onIngresar(r.token),
    onError: (e: any) => setError(mensajeError(e, "No pudimos verificar tus datos.")),
  });

  function enviar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    ingresar.mutate();
  }

  return (
    <form onSubmit={enviar} className={`${CLASE_TARJETA} space-y-4`}>
      <div>
        <p className="font-mono text-[11px] uppercase tracking-[0.15em] text-brand-700 dark:text-brand-300">{empresa?.nombre ?? "Portal de clientes"}</p>
        <h1 className="text-2xl font-bold mt-1">Tu servicio de internet</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Consulta tu plan y tus facturas, envía tu comprobante de pago o reporta una falla.</p>
      </div>
      <label className="block">
        <span className="text-sm font-medium">Cédula o RUC del titular</span>
        <input id="portal-cedula" inputMode="numeric" autoComplete="off" value={identificacion} onChange={(e) => setIdentificacion(e.target.value)} className={CLASE_CAMPO} placeholder="0102030405" />
      </label>
      <label className="block">
        <span className="text-sm font-medium">Últimos 4 dígitos de tu teléfono registrado</span>
        <input id="portal-telefono" inputMode="numeric" maxLength={4} autoComplete="off" value={ultimos4} onChange={(e) => setUltimos4(e.target.value)} className={CLASE_CAMPO} placeholder="4567" />
      </label>
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      <button type="submit" disabled={ingresar.isPending} className={CLASE_BOTON}>
        {ingresar.isPending ? "Verificando..." : "Ingresar"}
      </button>
    </form>
  );
}

type Accion = null | "comprobante" | "falla";

function Panel({ onSesionVencida }: { onSesionVencida: () => void }) {
  const queryClient = useQueryClient();
  const [accion, setAccion] = useState<Accion>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["portal-yo"],
    queryFn: async () => (await apiPortal.get<DatosPortal>("/yo")).data,
    retry: false,
  });
  if ((error as any)?.response?.status === 401) onSesionVencida();

  async function descargar(facturaId: number, numero: string) {
    try {
      const r = await apiPortal.get(`/facturas/${facturaId}/pdf`, { responseType: "blob" });
      const url = URL.createObjectURL(r.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = `factura-${numero}.pdf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch {
      setAviso("No pudimos descargar la factura. Intenta de nuevo.");
    }
  }

  function terminado(mensaje: string) {
    setAccion(null);
    setAviso(mensaje);
    queryClient.invalidateQueries({ queryKey: ["portal-yo"] });
  }

  if (isLoading || !data) return <p className="text-center text-gray-500">Cargando tu información...</p>;

  const estado = data.pago.estado;
  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-gray-500 dark:text-gray-400">{data.empresa}</p>
        <h1 className="text-xl font-bold">Hola, {data.nombre.split(" ")[0]}</h1>
      </div>

      {aviso && (
        <div className="border-l-4 border-brand-600 bg-brand-50 dark:bg-brand-900/30 px-3 py-2 text-sm flex justify-between gap-2">
          <span>{aviso}</span>
          <button onClick={() => setAviso(null)} className="text-gray-500" aria-label="Cerrar aviso">×</button>
        </div>
      )}

      <section className={CLASE_TARJETA}>
        <div className="flex items-center gap-2 text-brand-700 dark:text-brand-300 mb-2">
          <Wifi className="w-5 h-5" />
          <h2 className="font-semibold">Tu plan</h2>
        </div>
        {data.plan ? (
          <>
            <p className="text-lg font-semibold">{data.plan.nombre}</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Bajada {data.plan.bajada} · Subida {data.plan.subida}
            </p>
            <div
              className={`mt-3 rounded-sm px-3 py-2 flex items-start gap-2 ${
                estado === "AL_DIA"
                  ? "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-300"
                  : estado === "PENDIENTE"
                    ? "bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300"
                    : "bg-red-50 dark:bg-red-950/30 text-red-800 dark:text-red-300"
              }`}
            >
              {estado === "AL_DIA" ? <CheckCircle2 className="w-5 h-5 shrink-0" /> : estado === "PENDIENTE" ? <Clock className="w-5 h-5 shrink-0" /> : <AlertTriangle className="w-5 h-5 shrink-0" />}
              <p className="text-sm">
                {estado === "AL_DIA" && "Estás al día con tu pago de este mes. ¡Gracias!"}
                {estado === "PENDIENTE" && (
                  <>
                    Tu pago de este mes (<b>${data.pago.monto}</b>) está pendiente. Puedes pagar hasta el <b>{fechaCorta(data.pago.fechaLimite)}</b>.
                  </>
                )}
                {estado === "VENCIDO" && (
                  <>
                    Tu pago de este mes (<b>${data.pago.monto}</b>) está vencido y el servicio puede suspenderse. Si ya transferiste, envíanos el comprobante.
                  </>
                )}
              </p>
            </div>
          </>
        ) : (
          <p className="text-sm text-gray-500">No tienes un plan de internet activo.</p>
        )}
      </section>

      <div className="grid grid-cols-2 gap-3">
        <button onClick={() => setAccion(accion === "comprobante" ? null : "comprobante")} className={`${CLASE_TARJETA} flex flex-col items-center gap-1 text-center hover:border-brand-600`}>
          <Upload className="w-6 h-6 text-brand-700 dark:text-brand-300" />
          <span className="text-sm font-semibold">Enviar comprobante de pago</span>
        </button>
        <button onClick={() => setAccion(accion === "falla" ? null : "falla")} className={`${CLASE_TARJETA} flex flex-col items-center gap-1 text-center hover:border-brand-600`}>
          <AlertTriangle className="w-6 h-6 text-amber-600" />
          <span className="text-sm font-semibold">Reportar una falla</span>
        </button>
      </div>

      {accion === "comprobante" && <FormularioComprobante montoSugerido={data.pago.monto} onListo={terminado} />}
      {accion === "falla" && <FormularioFalla onListo={terminado} />}

      <section className={CLASE_TARJETA}>
        <div className="flex items-center gap-2 text-brand-700 dark:text-brand-300 mb-2">
          <FileText className="w-5 h-5" />
          <h2 className="font-semibold">Tus facturas</h2>
        </div>
        {data.facturas.length === 0 && <p className="text-sm text-gray-500">Todavía no tienes facturas.</p>}
        <ul className="divide-y divide-stone-200 dark:divide-gray-700">
          {data.facturas.map((f) => (
            <li key={f.id} className="py-2 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-medium">{fechaCorta(f.fecha)}</p>
                <p className="text-xs text-gray-500 font-mono">
                  N° {f.numero} · ${f.total}
                  {f.estadoPago !== "PAGADA" && <span className="text-amber-700 dark:text-amber-400"> · saldo ${f.saldo}</span>}
                </p>
              </div>
              {f.tienePdf && (
                <button onClick={() => descargar(f.id, f.numero)} className="flex items-center gap-1 text-sm text-brand-700 dark:text-brand-300 font-semibold shrink-0">
                  <Download className="w-4 h-4" /> PDF
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>

      {data.tickets.length > 0 && (
        <section className={CLASE_TARJETA}>
          <h2 className="font-semibold mb-2">Tus reportes recientes</h2>
          <ul className="divide-y divide-stone-200 dark:divide-gray-700">
            {data.tickets.map((t) => (
              <li key={t.id} className="py-2">
                <p className="text-sm">
                  #{t.id} · {t.asunto}
                </p>
                <p className="text-xs text-gray-500">
                  {fechaCorta(t.createdAt)} · <b>{ESTADO_TICKET[t.estado] ?? t.estado}</b>
                  {t.solucion && ` · ${t.solucion}`}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function FormularioComprobante({ montoSugerido, onListo }: { montoSugerido: string | null; onListo: (m: string) => void }) {
  const [monto, setMonto] = useState(montoSugerido ?? "");
  const [banco, setBanco] = useState("");
  const [referencia, setReferencia] = useState("");
  const [archivo, setArchivo] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  const enviar = useMutation({
    mutationFn: async () => {
      const datos = new FormData();
      datos.append("monto", monto);
      datos.append("banco", banco);
      datos.append("referencia", referencia);
      if (archivo) datos.append("comprobante", archivo);
      return (await apiPortal.post<{ mensaje: string }>("/comprobante", datos)).data;
    },
    onSuccess: (r) => onListo(r.mensaje),
    onError: (e: any) => setError(mensajeError(e, "No pudimos recibir tu comprobante.")),
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        enviar.mutate();
      }}
      className={`${CLASE_TARJETA} space-y-3`}
    >
      <h2 className="font-semibold">Enviar comprobante de transferencia</h2>
      <label className="block">
        <span className="text-sm">Foto o PDF del comprobante</span>
        <input id="portal-archivo" type="file" accept="image/*,application/pdf" onChange={(e) => setArchivo(e.target.files?.[0] ?? null)} className="block w-full text-sm mt-1" />
      </label>
      <label className="block">
        <span className="text-sm">Monto transferido ($)</span>
        <input id="portal-monto" inputMode="decimal" value={monto} onChange={(e) => setMonto(e.target.value)} className={CLASE_CAMPO} />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="text-sm">Banco (opcional)</span>
          <input id="portal-banco" value={banco} onChange={(e) => setBanco(e.target.value)} className={CLASE_CAMPO} />
        </label>
        <label className="block">
          <span className="text-sm">N° de comprobante (opcional)</span>
          <input id="portal-referencia" value={referencia} onChange={(e) => setReferencia(e.target.value)} className={CLASE_CAMPO} />
        </label>
      </div>
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      <button type="submit" disabled={!archivo || enviar.isPending} className={CLASE_BOTON}>
        {enviar.isPending ? "Enviando..." : "Enviar comprobante"}
      </button>
    </form>
  );
}

function FormularioFalla({ onListo }: { onListo: (m: string) => void }) {
  const [categoria, setCategoria] = useState("SIN_SERVICIO");
  const [descripcion, setDescripcion] = useState("");
  const [error, setError] = useState<string | null>(null);

  const enviar = useMutation({
    mutationFn: async () => (await apiPortal.post<{ mensaje: string }>("/falla", { categoria, descripcion })).data,
    onSuccess: (r) => onListo(r.mensaje),
    onError: (e: any) => setError(mensajeError(e, "No pudimos registrar tu reporte.")),
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        enviar.mutate();
      }}
      className={`${CLASE_TARJETA} space-y-3`}
    >
      <h2 className="font-semibold">Reportar una falla</h2>
      <div className="grid gap-2">
        {[
          ["SIN_SERVICIO", "No tengo internet"],
          ["LENTITUD", "El internet está lento"],
          ["INTERMITENCIA", "Se corta a ratos"],
          ["OTRO", "Otro problema"],
        ].map(([valor, texto]) => (
          <label key={valor} className="flex items-center gap-2 border border-stone-300 dark:border-gray-600 rounded-sm px-3 py-2">
            <input type="radio" name="categoria-falla" value={valor} checked={categoria === valor} onChange={() => setCategoria(valor)} />
            <span>{texto}</span>
          </label>
        ))}
      </div>
      <label className="block">
        <span className="text-sm">Cuéntanos qué pasa (opcional)</span>
        <textarea id="portal-descripcion" rows={3} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} className={CLASE_CAMPO} placeholder="Ej. el módem tiene una luz roja desde la mañana" />
      </label>
      <p className="text-xs text-gray-500">Antes de reportar, prueba apagar el módem 30 segundos y volver a encenderlo.</p>
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      <button type="submit" disabled={enviar.isPending} className={CLASE_BOTON}>
        {enviar.isPending ? "Enviando..." : "Enviar reporte"}
      </button>
    </form>
  );
}
