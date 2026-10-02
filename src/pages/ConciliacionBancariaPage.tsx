import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import { api, type CuentaBancaria } from "../api/client";
import { PageHeader } from "../components/PageHeader";
import { BuscadorCliente } from "../components/BuscadorCliente";
import { CLASE_CAMPO, CLASE_ETIQUETA, CLASE_THEAD, CLASE_TITULO_SECCION } from "../components/FormatoDocumento";
import { useToast } from "../components/ToastProvider";

// Conciliación bancaria: se sube el extracto del banco (Excel o CSV), el
// sistema sugiere a qué cliente de internet corresponde cada transferencia y,
// con lo que la persona confirme, registra los pagos igual que "Registrar
// pago" en Facturación de Internet. El archivo se lee en el navegador; al
// servidor solo viajan las filas ya interpretadas.

type Columna = "fecha" | "descripcion" | "monto" | "referencia";
const ETIQUETA_COLUMNA: Record<Columna, string> = {
  fecha: "Fecha",
  descripcion: "Descripción / concepto",
  monto: "Monto del crédito",
  referencia: "Referencia (opcional)",
};
// Encabezados típicos de los extractos de bancos ecuatorianos.
const PISTAS: Record<Columna, RegExp> = {
  fecha: /fecha/i,
  descripcion: /descrip|concepto|detalle|transacci|beneficiario|ordenante/i,
  monto: /cr[eé]dito|abono|ingreso|valor|monto|importe/i,
  referencia: /referencia|documento|comprobante|n[uú]mero|nro|secuencial/i,
};

interface ClienteResumen {
  id: number;
  razonSocial: string;
  identificacion: string;
  plan: string;
  montosEsperados: number[];
  pendienteEsteCiclo: boolean;
}
interface Coincidencia {
  clienteId: number;
  puntaje: number;
  motivos: string[];
  cliente: ClienteResumen;
}
interface FilaAnalizada {
  fila: number;
  fecha: string | null;
  descripcion: string;
  monto: number;
  referencia: string | null;
  referenciaPago: string;
  estado: "SUGERIDO" | "AMBIGUO" | "SIN_COINCIDENCIA" | "NO_ES_INGRESO" | "YA_REGISTRADO";
  sugerido: Coincidencia | null;
  candidatos: Coincidencia[];
}
interface Eleccion {
  incluir: boolean;
  clienteId: number | "";
  nombre: string | null;
}

const ETIQUETA_ESTADO: Record<FilaAnalizada["estado"], { texto: string; clase: string }> = {
  SUGERIDO: { texto: "Coincide", clase: "border-emerald-500 text-emerald-700 dark:text-emerald-400" },
  AMBIGUO: { texto: "Revisar", clase: "border-amber-500 text-amber-700 dark:text-amber-400" },
  SIN_COINCIDENCIA: { texto: "Sin cliente", clase: "border-gray-400 text-gray-500" },
  NO_ES_INGRESO: { texto: "No es ingreso", clase: "border-gray-300 text-gray-400" },
  YA_REGISTRADO: { texto: "Ya registrado", clase: "border-sky-500 text-sky-700 dark:text-sky-400" },
};

function textoCelda(v: unknown): string {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return v == null ? "" : String(v).trim();
}

export function ConciliacionBancariaPage() {
  const queryClient = useQueryClient();
  const { mostrarToast } = useToast();
  const [nombreArchivo, setNombreArchivo] = useState("");
  const [encabezados, setEncabezados] = useState<string[]>([]);
  const [filasCrudas, setFilasCrudas] = useState<unknown[][]>([]);
  const [mapeo, setMapeo] = useState<Record<Columna, number>>({ fecha: -1, descripcion: -1, monto: -1, referencia: -1 });
  const [cuentaBancariaId, setCuentaBancariaId] = useState("");
  const [analizadas, setAnalizadas] = useState<FilaAnalizada[] | null>(null);
  const [elecciones, setElecciones] = useState<Record<number, Eleccion>>({});
  const [resultado, setResultado] = useState<{ registrados: number; resultados: { fila: number; ok: boolean; mensaje: string }[] } | null>(null);

  const { data: cuentas } = useQuery({
    queryKey: ["cuentas-bancarias"],
    queryFn: async () => (await api.get<CuentaBancaria[]>("/cuentas-bancarias")).data,
  });

  function leerArchivo(archivo: File) {
    const lector = new FileReader();
    lector.onload = () => {
      try {
        const libro = XLSX.read(lector.result, { type: "array", cellDates: true });
        const hoja = libro.Sheets[libro.SheetNames[0]];
        const filas = XLSX.utils.sheet_to_json<unknown[]>(hoja, { header: 1, blankrows: false, raw: true });
        // El encabezado es la primera fila con al menos 3 celdas de texto
        // (muchos extractos traen antes el nombre del banco, la cuenta, etc.).
        const indiceEncabezado = filas.findIndex((f) => f.filter((c) => typeof c === "string" && c.trim()).length >= 3);
        if (indiceEncabezado === -1) throw new Error("No se encontró la fila de encabezados");
        const cab = filas[indiceEncabezado].map(textoCelda);
        const datos = filas.slice(indiceEncabezado + 1).filter((f) => f.some((c) => textoCelda(c) !== ""));
        const auto = { fecha: -1, descripcion: -1, monto: -1, referencia: -1 } as Record<Columna, number>;
        (Object.keys(PISTAS) as Columna[]).forEach((col) => {
          auto[col] = cab.findIndex((h, i) => PISTAS[col].test(h) && !Object.values(auto).includes(i));
        });
        setEncabezados(cab);
        setFilasCrudas(datos);
        setMapeo(auto);
        setNombreArchivo(archivo.name);
        setAnalizadas(null);
        setResultado(null);
      } catch (error: any) {
        mostrarToast(`No se pudo leer el archivo: ${error.message}`);
      }
    };
    lector.readAsArrayBuffer(archivo);
  }

  const movimientos = useMemo(
    () =>
      filasCrudas.map((f, i) => ({
        fila: i + 1,
        fecha: mapeo.fecha >= 0 ? textoCelda(f[mapeo.fecha]) : null,
        descripcion: mapeo.descripcion >= 0 ? textoCelda(f[mapeo.descripcion]) : "",
        monto: mapeo.monto >= 0 ? f[mapeo.monto] : null,
        referencia: mapeo.referencia >= 0 ? textoCelda(f[mapeo.referencia]) : null,
      })),
    [filasCrudas, mapeo]
  );

  const analizar = useMutation({
    mutationFn: async () => (await api.post<FilaAnalizada[]>("/conciliacion-bancaria/analizar", { movimientos })).data,
    onSuccess: (filas) => {
      setAnalizadas(filas);
      setResultado(null);
      const iniciales: Record<number, Eleccion> = {};
      for (const f of filas) {
        iniciales[f.fila] = f.sugerido
          ? { incluir: true, clienteId: f.sugerido.clienteId, nombre: f.sugerido.cliente.razonSocial }
          : { incluir: false, clienteId: "", nombre: null };
      }
      setElecciones(iniciales);
    },
    onError: (error: any) => mostrarToast(error.response?.data?.error ?? "No se pudo analizar el extracto"),
  });

  const aRegistrar = (analizadas ?? []).filter((f) => elecciones[f.fila]?.incluir && elecciones[f.fila]?.clienteId);
  const totalARegistrar = aRegistrar.reduce((s, f) => s + f.monto, 0);

  const registrar = useMutation({
    mutationFn: async () =>
      (
        await api.post<{ registrados: number; resultados: { fila: number; ok: boolean; mensaje: string }[] }>("/conciliacion-bancaria/registrar", {
          cuentaBancariaId: Number(cuentaBancariaId),
          pagos: aRegistrar.map((f) => ({ fila: f.fila, clienteId: elecciones[f.fila].clienteId, monto: f.monto, referenciaPago: f.referenciaPago })),
        })
      ).data,
    onSuccess: (r) => {
      setResultado(r);
      queryClient.invalidateQueries({ queryKey: ["facturas-internet-clientes"] });
      mostrarToast(`${r.registrados} pago(s) registrado(s)`, r.registrados > 0 ? "success" : "info");
      analizar.mutate();
    },
    onError: (error: any) => mostrarToast(error.response?.data?.error ?? "No se pudieron registrar los pagos"),
  });

  function elegir(fila: number, cambios: Partial<Eleccion>) {
    setElecciones((e) => ({ ...e, [fila]: { ...e[fila], ...cambios } }));
  }

  const conteo = (estado: FilaAnalizada["estado"]) => analizadas?.filter((f) => f.estado === estado).length ?? 0;
  const faltaMapeo = mapeo.descripcion < 0 || mapeo.monto < 0;

  return (
    <div>
      <PageHeader
        titulo="Conciliación bancaria"
        subtitulo="Sube el extracto del banco y el sistema identifica qué transferencia es de qué cliente. Revisas, confirmas y los pagos quedan registrados (y el servicio reactivado)."
      />

      <div className="bg-white dark:bg-gray-800 rounded-sm border border-stone-300 dark:border-gray-700 p-4 mb-4 space-y-4">
        <div className="grid md:grid-cols-2 gap-4">
          <label className="block">
            <span className={CLASE_ETIQUETA}>1. Cuenta bancaria del extracto</span>
            <select id="cuenta-bancaria" value={cuentaBancariaId} onChange={(e) => setCuentaBancariaId(e.target.value)} className={CLASE_CAMPO}>
              <option value="">— Elegir —</option>
              {cuentas?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre} · {c.banco} {c.numeroCuenta}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className={CLASE_ETIQUETA}>2. Archivo del extracto (Excel o CSV)</span>
            <input
              id="archivo-extracto"
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={(e) => e.target.files?.[0] && leerArchivo(e.target.files[0])}
              className="block w-full text-sm mt-1"
            />
            {nombreArchivo && <span className="text-xs text-gray-500">{nombreArchivo} · {filasCrudas.length} movimiento(s)</span>}
          </label>
        </div>

        {encabezados.length > 0 && (
          <div>
            <p className={`${CLASE_TITULO_SECCION} mb-2`}>3. Columnas del extracto</p>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {(Object.keys(ETIQUETA_COLUMNA) as Columna[]).map((col) => (
                <label key={col} className="block">
                  <span className={CLASE_ETIQUETA}>{ETIQUETA_COLUMNA[col]}</span>
                  <select id={`columna-${col}`} value={mapeo[col]} onChange={(e) => setMapeo({ ...mapeo, [col]: Number(e.target.value) })} className={CLASE_CAMPO}>
                    <option value={-1}>— Ninguna —</option>
                    {encabezados.map((h, i) => (
                      <option key={i} value={i}>
                        {h || `Columna ${i + 1}`}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Si el extracto tiene columnas separadas de débito y crédito, elige la de <b>crédito</b> en "Monto". Los débitos y las filas en cero se ignoran.
            </p>
            <div className="flex justify-end mt-3">
              <button
                onClick={() => analizar.mutate()}
                disabled={faltaMapeo || analizar.isPending}
                className="bg-brand-700 hover:bg-brand-800 disabled:opacity-50 text-white text-sm font-semibold px-4 py-1.5 rounded-sm"
              >
                {analizar.isPending ? "Analizando..." : "Analizar extracto"}
              </button>
            </div>
          </div>
        )}
      </div>

      {analizadas && (
        <div className="bg-white dark:bg-gray-800 rounded-sm border border-stone-300 dark:border-gray-700">
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-stone-200 dark:border-gray-700">
            <p className="text-sm text-gray-600 dark:text-gray-300">
              <b className="text-emerald-700 dark:text-emerald-400">{conteo("SUGERIDO")}</b> coinciden ·{" "}
              <b className="text-amber-700 dark:text-amber-400">{conteo("AMBIGUO")}</b> para revisar · {conteo("SIN_COINCIDENCIA")} sin cliente ·{" "}
              {conteo("YA_REGISTRADO")} ya registrados · {conteo("NO_ES_INGRESO")} no son ingresos
            </p>
            <button
              onClick={() => registrar.mutate()}
              disabled={aRegistrar.length === 0 || !cuentaBancariaId || registrar.isPending}
              title={!cuentaBancariaId ? "Elige primero la cuenta bancaria" : undefined}
              className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-1.5 rounded-sm"
            >
              {registrar.isPending ? "Registrando..." : `Registrar ${aRegistrar.length} pago(s) · $${totalARegistrar.toFixed(2)}`}
            </button>
          </div>

          {resultado && resultado.resultados.some((r) => !r.ok) && (
            <div className="px-4 py-2 border-b border-stone-200 dark:border-gray-700 bg-amber-50 dark:bg-amber-950/20 text-xs text-amber-800 dark:text-amber-300">
              {resultado.resultados.filter((r) => !r.ok).map((r) => (
                <p key={r.fila}>Fila {r.fila}: {r.mensaje}</p>
              ))}
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className={CLASE_THEAD}>
                <tr>
                  <th className="px-3 py-2 w-8"></th>
                  <th className="px-3 py-2">Movimiento</th>
                  <th className="px-3 py-2 text-right">Monto</th>
                  <th className="px-3 py-2">Estado</th>
                  <th className="px-3 py-2 min-w-72">Cliente</th>
                </tr>
              </thead>
              <tbody>
                {analizadas
                  .filter((f) => f.estado !== "NO_ES_INGRESO")
                  .map((f) => {
                    const el = elecciones[f.fila];
                    const bloqueada = f.estado === "YA_REGISTRADO";
                    return (
                      <tr key={f.fila} className="border-t border-stone-100 dark:border-gray-700 align-top">
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            id={`incluir-${f.fila}`}
                            aria-label={`Registrar fila ${f.fila}`}
                            checked={!!el?.incluir}
                            disabled={bloqueada || !el?.clienteId}
                            onChange={(e) => elegir(f.fila, { incluir: e.target.checked })}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <span className="block">{f.descripcion || <span className="text-gray-400">(sin descripción)</span>}</span>
                          <span className="block font-mono text-[11px] text-gray-400">
                            Fila {f.fila} · {f.fecha || "sin fecha"}
                            {f.referencia ? ` · ref ${f.referencia}` : ""}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums whitespace-nowrap">${f.monto.toFixed(2)}</td>
                        <td className="px-3 py-2">
                          <span className={`font-mono text-[10px] uppercase tracking-wider border px-1 rounded-sm whitespace-nowrap ${ETIQUETA_ESTADO[f.estado].clase}`}>
                            {ETIQUETA_ESTADO[f.estado].texto}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          {bloqueada ? (
                            <span className="text-xs text-gray-500">Este movimiento ya se registró antes.</span>
                          ) : (
                            <div className="space-y-1">
                              {el?.clienteId ? (
                                <p className="text-sm">
                                  <b>{el.nombre}</b>
                                  <button onClick={() => elegir(f.fila, { clienteId: "", nombre: null, incluir: false })} className="ml-2 text-xs text-gray-500 hover:underline">
                                    cambiar
                                  </button>
                                </p>
                              ) : (
                                <BuscadorCliente
                                  clienteId=""
                                  onSeleccionar={(id, cliente) => id && elegir(f.fila, { clienteId: id, nombre: cliente?.razonSocial ?? `Cliente #${id}`, incluir: true })}
                                />
                              )}
                              {f.sugerido && el?.clienteId === f.sugerido.clienteId && (
                                <p className="text-[11px] text-gray-500">{f.sugerido.motivos.join(" · ")}</p>
                              )}
                              {!el?.clienteId && f.candidatos.length > 0 && (
                                <div className="flex flex-wrap gap-1">
                                  {f.candidatos.map((c) => (
                                    <button
                                      key={c.clienteId}
                                      onClick={() => elegir(f.fila, { clienteId: c.clienteId, nombre: c.cliente.razonSocial, incluir: true })}
                                      title={c.motivos.join(" · ")}
                                      className="text-xs border border-stone-300 dark:border-gray-600 rounded-sm px-1.5 py-0.5 hover:bg-stone-100 dark:hover:bg-gray-700"
                                    >
                                      {c.cliente.razonSocial} · {c.cliente.plan}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
