import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import { EJEMPLOS_BUSQUEDA, interpretarBusqueda, type ResultadoBusqueda, type SinonimoBusqueda } from "../utils/interpretarBusqueda";

interface ClienteInternetPorMes {
  id: number;
  identificacion: string;
  razonSocial: string;
  telefono: string | null;
  plan: string;
}

interface RespuestaClientesInternetPorMes {
  anio: number;
  mes: number;
  estado: "pagaron" | "no-pagaron";
  total: number;
  clientes: ClienteInternetPorMes[];
}

interface ClientePorEstado {
  id: number;
  identificacion: string;
  razonSocial: string;
  telefono: string | null;
  nodo: string;
  direccionIp: string;
}

interface RespuestaClientesPorEstado {
  estado: "activos" | "suspendidos";
  total: number;
  clientes: ClientePorEstado[];
  nodosConError: string[];
}

const NOMBRE_MES = [
  "",
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

// Los tipos del Web Speech API no vienen en lib.dom.d.ts en todos los
// navegadores/versiones de TypeScript — se declara acá lo mínimo que se usa,
// en vez de agregar una dependencia solo para esto. Chrome/Edge lo exponen
// como "webkitSpeechRecognition"; Firefox y Safari todavía no lo soportan
// (se detecta en tiempo de ejecución, ver puedeDictar más abajo).
interface EventoResultadoVoz extends Event {
  results: { [i: number]: { [j: number]: { transcript: string } } };
}
interface ReconocimientoVoz extends EventTarget {
  lang: string;
  interimResults: boolean;
  onresult: ((ev: EventoResultadoVoz) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}

// Buscador dinámico por texto o voz — sin ninguna IA de por medio: solo
// reconoce un vocabulario fijo de frases (ver utils/interpretarBusqueda.ts).
// El botón de dictado transcribe lo que se dice directo al cuadro de texto,
// usando la API de reconocimiento de voz que ya trae el navegador.
//
// "ventas de [mes]" no tiene su propia tabla acá — reusa el reporte de
// ventas que ya existe arriba en la pantalla, moviendo su selector de fechas
// al mes pedido (por eso onVentasPorMes). Solo "clientes que
// (no) pagaron [mes]" es un reporte nuevo que no existía antes.
export function BuscadorReportes({ onVentasPorMes }: { onVentasPorMes: (anio: number, mes: number) => void }) {
  const [texto, setTexto] = useState("");
  const [consultaClientes, setConsultaClientes] = useState<
    Extract<ResultadoBusqueda, { tipo: "clientes-internet-por-mes" }> | null
  >(null);
  const [consultaEstado, setConsultaEstado] = useState<
    Extract<ResultadoBusqueda, { tipo: "clientes-por-estado" }> | null
  >(null);
  const [noEntendido, setNoEntendido] = useState(false);
  const [avisoVentas, setAvisoVentas] = useState<string | null>(null);
  const [escuchando, setEscuchando] = useState(false);
  const reconocimientoRef = useRef<ReconocimientoVoz | null>(null);

  const puedeDictar =
    typeof window !== "undefined" && ("webkitSpeechRecognition" in window || "SpeechRecognition" in window);

  // Palabras que el admin agregó a mano desde Ajustes → "Diccionario del
  // buscador" — se combinan con el vocabulario de fábrica en cada búsqueda
  // (ver utils/interpretarBusqueda.ts). staleTime alto porque este
  // diccionario cambia poco; si un admin lo edita, recarga la pantalla.
  const { data: sinonimos } = useQuery({
    queryKey: ["sinonimos-busqueda"],
    queryFn: async () => (await api.get<SinonimoBusqueda[]>("/sinonimos-busqueda")).data,
    staleTime: 5 * 60_000,
  });

  useEffect(() => {
    return () => {
      reconocimientoRef.current?.stop();
    };
  }, []);

  function alternarDictado() {
    if (escuchando) {
      reconocimientoRef.current?.stop();
      return;
    }
    const Constructor =
      (window as unknown as { webkitSpeechRecognition?: new () => ReconocimientoVoz; SpeechRecognition?: new () => ReconocimientoVoz })
        .webkitSpeechRecognition ??
      (window as unknown as { SpeechRecognition?: new () => ReconocimientoVoz }).SpeechRecognition;
    if (!Constructor) return;

    const reconocimiento = new Constructor();
    reconocimiento.lang = "es-EC";
    reconocimiento.interimResults = false;
    reconocimiento.onresult = (ev) => {
      const transcripcion = ev.results[0][0].transcript;
      setTexto(transcripcion);
    };
    reconocimiento.onerror = () => setEscuchando(false);
    reconocimiento.onend = () => setEscuchando(false);
    reconocimientoRef.current = reconocimiento;
    setEscuchando(true);
    reconocimiento.start();
  }

  function buscar() {
    const resultado = interpretarBusqueda(texto, sinonimos ?? []);
    setNoEntendido(resultado === null);
    setAvisoVentas(null);
    setConsultaClientes(null);
    setConsultaEstado(null);

    if (!resultado) return;
    if (resultado.tipo === "ventas-por-mes") {
      onVentasPorMes(resultado.anio, resultado.mes);
      setAvisoVentas(`Filtro de "Ventas" movido a ${NOMBRE_MES[resultado.mes]} de ${resultado.anio}, más abajo.`);
      return;
    }
    if (resultado.tipo === "clientes-por-estado") {
      setConsultaEstado(resultado);
      return;
    }
    setConsultaClientes(resultado);
  }

  const { data, isLoading } = useQuery({
    queryKey: ["buscador-clientes-internet-por-mes", consultaClientes],
    queryFn: async () =>
      (
        await api.get<RespuestaClientesInternetPorMes>("/reportes/clientes-internet-por-mes", {
          params: { anio: consultaClientes!.anio, mes: consultaClientes!.mes, estado: consultaClientes!.estado },
        })
      ).data,
    enabled: consultaClientes !== null,
  });

  const { data: dataEstado, isLoading: cargandoEstado } = useQuery({
    queryKey: ["buscador-clientes-por-estado", consultaEstado],
    queryFn: async () =>
      (
        await api.get<RespuestaClientesPorEstado>("/reportes/clientes-por-estado", {
          params: { estado: consultaEstado!.estado },
        })
      ).data,
    enabled: consultaEstado !== null,
  });

  return (
    <div className="bg-white dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-700 p-4 mb-6">
      <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-1">Buscador dinámico</h3>
      <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">
        Escribe o dicta una consulta, ej. "{EJEMPLOS_BUSQUEDA[0]}". Reconoce un vocabulario fijo de frases — no está
        conectado a ninguna inteligencia artificial.
      </p>
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && buscar()}
          placeholder={EJEMPLOS_BUSQUEDA[0]}
          className="flex-1 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm"
        />
        {puedeDictar && (
          <button
            type="button"
            onClick={alternarDictado}
            title={escuchando ? "Detener dictado" : "Dictar por voz"}
            className={`px-3 py-2 rounded-md text-sm font-medium ${
              escuchando
                ? "bg-red-600 text-white animate-pulse"
                : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600"
            }`}
          >
            🎤
          </button>
        )}
        <button
          type="button"
          onClick={buscar}
          className="bg-slate-800 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-slate-700"
        >
          Buscar
        </button>
      </div>

      {noEntendido && (
        <p className="text-xs text-amber-600 dark:text-amber-400 mt-3">
          No entendí esa búsqueda. Prueba con algo como: {EJEMPLOS_BUSQUEDA.map((e) => `"${e}"`).join(", ")}. Si crees
          que esta palabra debería reconocerse, un administrador puede agregarla en Ajustes → "Diccionario del
          buscador".
        </p>
      )}

      {avisoVentas && <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-3">{avisoVentas}</p>}

      {consultaClientes && (
        <div className="mt-4">
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
            Clientes que {consultaClientes.estado === "pagaron" ? "pagaron" : "NO pagaron"} su plan de internet en{" "}
            {NOMBRE_MES[consultaClientes.mes]} de {consultaClientes.anio}
            {data && ` — ${data.total} resultado(s)`}
          </p>
          {isLoading && <p className="text-sm text-gray-400 dark:text-gray-500">Buscando...</p>}
          {data && data.clientes.length === 0 && (
            <p className="text-sm text-gray-400 dark:text-gray-500">Sin resultados.</p>
          )}
          {data && data.clientes.length > 0 && (
            <div className="overflow-hidden rounded-md border border-gray-100 dark:border-gray-700">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-900/50 text-left text-gray-600 dark:text-gray-300">
                  <tr>
                    <th className="px-3 py-2">Identificación</th>
                    <th className="px-3 py-2">Razón Social</th>
                    <th className="px-3 py-2">Teléfono</th>
                    <th className="px-3 py-2">Plan</th>
                  </tr>
                </thead>
                <tbody>
                  {data.clientes.map((c) => (
                    <tr key={c.id} className="border-t border-gray-100 dark:border-gray-700">
                      <td className="px-3 py-2 font-mono text-xs">{c.identificacion}</td>
                      <td className="px-3 py-2">{c.razonSocial}</td>
                      <td className="px-3 py-2">{c.telefono ?? "—"}</td>
                      <td className="px-3 py-2">{c.plan}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {consultaEstado && (
        <div className="mt-4">
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
            Clientes {consultaEstado.estado === "suspendidos" ? "suspendidos" : "activos"} ahora mismo
            {dataEstado && ` — ${dataEstado.total} resultado(s)`}
          </p>
          {cargandoEstado && <p className="text-sm text-gray-400 dark:text-gray-500">Consultando los routers Mikrotik...</p>}
          {dataEstado && dataEstado.nodosConError.length > 0 && (
            <p className="text-xs text-amber-600 dark:text-amber-400 mb-2">
              No se pudo consultar: {dataEstado.nodosConError.join(", ")} — sus clientes quedan afuera de este
              resultado.
            </p>
          )}
          {dataEstado && dataEstado.clientes.length === 0 && (
            <p className="text-sm text-gray-400 dark:text-gray-500">Sin resultados.</p>
          )}
          {dataEstado && dataEstado.clientes.length > 0 && (
            <div className="overflow-hidden rounded-md border border-gray-100 dark:border-gray-700">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-900/50 text-left text-gray-600 dark:text-gray-300">
                  <tr>
                    <th className="px-3 py-2">Identificación</th>
                    <th className="px-3 py-2">Razón Social</th>
                    <th className="px-3 py-2">Teléfono</th>
                    <th className="px-3 py-2">Nodo</th>
                    <th className="px-3 py-2">IP</th>
                  </tr>
                </thead>
                <tbody>
                  {dataEstado.clientes.map((c) => (
                    <tr key={c.id} className="border-t border-gray-100 dark:border-gray-700">
                      <td className="px-3 py-2 font-mono text-xs">{c.identificacion}</td>
                      <td className="px-3 py-2">{c.razonSocial}</td>
                      <td className="px-3 py-2">{c.telefono ?? "—"}</td>
                      <td className="px-3 py-2">{c.nodo}</td>
                      <td className="px-3 py-2 font-mono text-xs">{c.direccionIp}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
