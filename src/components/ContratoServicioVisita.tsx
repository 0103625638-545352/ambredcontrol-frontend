import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileSignature } from "lucide-react";
import { api, urlArchivoSubido, type VisitaTecnica } from "../api/client";
import { useToast } from "./ToastProvider";

// Contrato del servicio firmado por el cliente en la pantalla del celular del
// técnico, al terminar la instalación (ver backend/src/routes/contratos.ts).
// Se muestra EN FLUJO debajo del acta de la visita — nunca en una ventana
// flotante position:fixed (ver memoria del proyecto sobre ese problema de
// pintado en algunos equipos).

interface VistaPrevia {
  datos: { cliente: string; cedula: string; plan: string; precio: string; vigenciaMeses: number | null };
  texto: string;
  equipos: { tipo: string; modelo: string | null; serial: string | null }[];
}

// Lienzo para firmar con el dedo o el mouse. Escala por devicePixelRatio para
// que el trazo no salga borroso en celulares con pantalla de alta densidad.
function PanelFirma({ onCambio }: { onCambio: (dataUrl: string | null) => void }) {
  const lienzo = useRef<HTMLCanvasElement>(null);
  const dibujando = useRef(false);
  const vacio = useRef(true);

  useEffect(() => {
    const c = lienzo.current!;
    const escala = window.devicePixelRatio || 1;
    const { width, height } = c.getBoundingClientRect();
    c.width = width * escala;
    c.height = height * escala;
    const ctx = c.getContext("2d")!;
    ctx.scale(escala, escala);
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#111";
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, width, height);
  }, []);

  function punto(e: React.PointerEvent<HTMLCanvasElement>) {
    const r = lienzo.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function empezar(e: React.PointerEvent<HTMLCanvasElement>) {
    e.preventDefault();
    lienzo.current!.setPointerCapture(e.pointerId);
    dibujando.current = true;
    const ctx = lienzo.current!.getContext("2d")!;
    const { x, y } = punto(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  }

  function mover(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!dibujando.current) return;
    e.preventDefault();
    const ctx = lienzo.current!.getContext("2d")!;
    const { x, y } = punto(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    vacio.current = false;
  }

  function terminar() {
    if (!dibujando.current) return;
    dibujando.current = false;
    onCambio(vacio.current ? null : lienzo.current!.toDataURL("image/png"));
  }

  function limpiar() {
    const c = lienzo.current!;
    const ctx = c.getContext("2d")!;
    const { width, height } = c.getBoundingClientRect();
    ctx.fillRect(0, 0, width, height);
    vacio.current = true;
    onCambio(null);
  }

  return (
    <div>
      <canvas
        ref={lienzo}
        onPointerDown={empezar}
        onPointerMove={mover}
        onPointerUp={terminar}
        onPointerLeave={terminar}
        className="w-full h-40 bg-white border-2 border-dashed border-stone-400 rounded-sm touch-none cursor-crosshair"
        aria-label="Espacio para la firma del cliente"
      />
      <div className="flex justify-between mt-1">
        <span className="text-[11px] text-gray-500">Firme con el dedo dentro del recuadro</span>
        <button type="button" onClick={limpiar} className="text-xs text-gray-600 dark:text-gray-300 hover:underline">
          Borrar firma
        </button>
      </div>
    </div>
  );
}

function ubicacionOpcional(): Promise<{ latitud: number; longitud: number } | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ latitud: p.coords.latitude, longitud: p.coords.longitude }),
      () => resolve(null),
      { timeout: 8000, maximumAge: 60_000 }
    );
  });
}

export function ContratoServicioVisita({ visita }: { visita: VisitaTecnica }) {
  const queryClient = useQueryClient();
  const { mostrarToast } = useToast();
  const [abierto, setAbierto] = useState(false);
  const [firma, setFirma] = useState<string | null>(null);
  const [nombre, setNombre] = useState(visita.cliente?.razonSocial ?? "");
  const [cedula, setCedula] = useState(visita.cliente?.identificacion ?? "");
  const [acepta, setAcepta] = useState(false);

  const { data: vista, isLoading, error } = useQuery({
    queryKey: ["contrato-vista-previa", visita.id],
    queryFn: async () => (await api.get<VistaPrevia>(`/contratos/visita/${visita.id}/vista-previa`)).data,
    enabled: abierto,
    retry: false,
  });

  const guardar = useMutation({
    mutationFn: async () => {
      const ubicacion = await ubicacionOpcional();
      return (await api.post(`/contratos/visita/${visita.id}`, { firmaPng: firma, nombreFirmante: nombre, cedulaFirmante: cedula, ...ubicacion })).data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mi-ruta-hoy"] });
      queryClient.invalidateQueries({ queryKey: ["rutas-visita"] });
      setAbierto(false);
      setFirma(null);
      setAcepta(false);
      mostrarToast("Contrato firmado y guardado", "success");
    },
    onError: (e: any) => mostrarToast(e.response?.data?.error ?? "No se pudo guardar el contrato"),
  });

  if (!visita.clienteId) return null;

  const contrato = visita.contrato;
  return (
    <div className="mt-2 border-t border-stone-200 dark:border-gray-700 pt-2">
      <div className="flex flex-wrap items-center gap-3">
        <FileSignature className="w-4 h-4 text-brand-700 dark:text-brand-300" />
        {contrato ? (
          <>
            <a href={urlArchivoSubido(contrato.pdfUrl)!} target="_blank" rel="noreferrer" className="text-xs font-semibold text-brand-700 dark:text-brand-300 hover:underline">
              Ver contrato firmado
            </a>
            <span className="text-[11px] text-gray-500">
              por {contrato.nombreFirmante} · {new Date(contrato.fecha).toLocaleDateString("es-EC")}
            </span>
            {!abierto && (
              <button onClick={() => setAbierto(true)} className="text-[11px] text-gray-500 hover:underline">
                volver a firmar
              </button>
            )}
          </>
        ) : (
          !abierto && (
            <button onClick={() => setAbierto(true)} className="text-xs font-semibold text-brand-700 dark:text-brand-300 hover:underline">
              Firmar contrato del servicio
            </button>
          )
        )}
      </div>

      {abierto && (
        <div className="mt-2 space-y-3 bg-stone-50 dark:bg-gray-900/40 border border-stone-200 dark:border-gray-700 rounded-sm p-3">
          {isLoading && <p className="text-xs text-gray-500">Preparando el contrato...</p>}
          {error && <p className="text-xs text-red-600">{(error as any).response?.data?.error ?? "No se pudo preparar el contrato"}</p>}
          {vista && (
            <>
              <p className="text-xs text-gray-600 dark:text-gray-300">
                <b>{vista.datos.plan}</b> · USD {vista.datos.precio}/mes · {vista.datos.vigenciaMeses ? `plazo mínimo ${vista.datos.vigenciaMeses} meses` : "sin plazo mínimo"}
              </p>
              <div className="max-h-56 overflow-y-auto text-[12px] leading-relaxed whitespace-pre-wrap bg-white dark:bg-gray-800 border border-stone-200 dark:border-gray-700 rounded-sm p-2">
                {vista.texto}
                {"\n\nEQUIPOS EN COMODATO:\n"}
                {vista.equipos.length === 0 ? "Ninguno registrado en el acta." : vista.equipos.map((e) => `• ${e.tipo}${e.modelo ? ` ${e.modelo}` : ""}${e.serial ? ` — Serie ${e.serial}` : ""}`).join("\n")}
              </div>
              {vista.equipos.length === 0 && <p className="text-[11px] text-amber-700 dark:text-amber-400">Consejo: guarda primero el acta con los equipos instalados, para que queden en el contrato.</p>}
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="text-[11px] text-gray-500">Nombre de quien firma</span>
                  <input id={`firmante-${visita.id}`} value={nombre} onChange={(e) => setNombre(e.target.value)} className="w-full border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 rounded-sm px-2 py-1.5 text-sm" />
                </label>
                <label className="block">
                  <span className="text-[11px] text-gray-500">Cédula de quien firma</span>
                  <input id={`cedula-firmante-${visita.id}`} inputMode="numeric" value={cedula} onChange={(e) => setCedula(e.target.value)} className="w-full border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 rounded-sm px-2 py-1.5 text-sm" />
                </label>
              </div>
              <PanelFirma onCambio={setFirma} />
              <label className="flex items-start gap-2 text-xs">
                <input type="checkbox" checked={acepta} onChange={(e) => setAcepta(e.target.checked)} className="mt-0.5" />
                <span>El cliente leyó el contrato y acepta sus condiciones.</span>
              </label>
              <div className="flex gap-2">
                <button
                  onClick={() => guardar.mutate()}
                  disabled={!firma || !acepta || !nombre.trim() || cedula.trim().length < 10 || guardar.isPending}
                  className="bg-brand-700 text-white px-3 py-1.5 rounded-md text-xs font-semibold hover:bg-brand-800 disabled:opacity-50"
                >
                  {guardar.isPending ? "Guardando..." : "Guardar contrato firmado"}
                </button>
                <button onClick={() => setAbierto(false)} className="bg-stone-200 dark:bg-gray-600 px-3 py-1.5 rounded-md text-xs">
                  Cancelar
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
