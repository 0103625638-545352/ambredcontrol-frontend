import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type FacturaConDetalle } from "../api/client";
import { Modal } from "./Modal";
import { useToast } from "./ToastProvider";

interface Props {
  facturaId: number;
  onCerrar: () => void;
}

interface ItemForm {
  productoId: number;
  nombre: string;
  cantidadFacturada: number;
  cantidad: string;
}

const MOTIVOS_TRASLADO = [
  { valor: "VENTA", etiqueta: "Venta" },
  { valor: "TRANSFERENCIA_ESTABLECIMIENTOS", etiqueta: "Transferencia entre establecimientos de la misma empresa" },
  { valor: "CONSIGNACION", etiqueta: "Consignación" },
  { valor: "DEVOLUCION", etiqueta: "Devolución" },
  { valor: "IMPORTACION", etiqueta: "Importación" },
  { valor: "EXPORTACION", etiqueta: "Exportación" },
  { valor: "OTROS", etiqueta: "Otros" },
];

const TIPOS_IDENTIFICACION = [
  { valor: "RUC", etiqueta: "RUC" },
  { valor: "CEDULA", etiqueta: "Cédula" },
  { valor: "PASAPORTE", etiqueta: "Pasaporte" },
];

function hoyIso(): string {
  return new Date().toISOString().slice(0, 10);
}

// Genera una guía de remisión (documento de transporte) sobre una factura ya
// AUTORIZADA por el SRI — precarga destinatario (cliente) e ítems desde la
// factura, todo editable, porque un envío puntual puede no coincidir 1 a 1
// con lo facturado (dirección de entrega distinta, o solo parte de lo
// vendido viaja en este camión).
export function ModalGenerarGuiaRemision({ facturaId, onCerrar }: Props) {
  const queryClient = useQueryClient();
  const { mostrarToast } = useToast();

  const { data: factura, isLoading } = useQuery({
    queryKey: ["factura-para-guia-remision", facturaId],
    queryFn: async () => (await api.get<FacturaConDetalle>(`/facturas/${facturaId}`)).data,
  });

  const [destinatarioTipoIdentificacion, setDestinatarioTipoIdentificacion] = useState("RUC");
  const [destinatarioIdentificacion, setDestinatarioIdentificacion] = useState("");
  const [destinatarioRazonSocial, setDestinatarioRazonSocial] = useState("");
  const [destinatarioDireccion, setDestinatarioDireccion] = useState("");
  const [motivoTraslado, setMotivoTraslado] = useState("VENTA");
  const [ruta, setRuta] = useState("");
  const [transportistaTipoIdentificacion, setTransportistaTipoIdentificacion] = useState("CEDULA");
  const [transportistaIdentificacion, setTransportistaIdentificacion] = useState("");
  const [transportistaRazonSocial, setTransportistaRazonSocial] = useState("");
  const [placa, setPlaca] = useState("");
  const [dirPartida, setDirPartida] = useState("");
  const [fechaIniTransporte, setFechaIniTransporte] = useState(hoyIso());
  const [fechaFinTransporte, setFechaFinTransporte] = useState(hoyIso());
  const [items, setItems] = useState<ItemForm[]>([]);

  // Precarga una sola vez, cuando llega la factura.
  useEffect(() => {
    if (!factura) return;
    setDestinatarioTipoIdentificacion(factura.cliente.tipoIdentificacion || "RUC");
    setDestinatarioIdentificacion(factura.cliente.identificacion);
    setDestinatarioRazonSocial(factura.cliente.razonSocial);
    setDestinatarioDireccion(factura.cliente.direccion ?? "");
    setItems(
      factura.detalles.map((d) => ({
        productoId: d.productoId,
        nombre: d.producto.nombre,
        cantidadFacturada: d.cantidad,
        cantidad: String(d.cantidad),
      }))
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [factura?.id]);

  function actualizarCantidad(productoId: number, cantidad: string) {
    setItems((actual) => actual.map((it) => (it.productoId === productoId ? { ...it, cantidad } : it)));
  }

  const itemsValidos = items.map((it) => ({ ...it, cantidadNum: parseInt(it.cantidad, 10) || 0 }));
  const hayAlgunItem = itemsValidos.some((it) => it.cantidadNum > 0);
  const algunaCantidadExcede = itemsValidos.some((it) => it.cantidadNum > it.cantidadFacturada);
  const formularioValido =
    hayAlgunItem &&
    !algunaCantidadExcede &&
    destinatarioIdentificacion.trim() !== "" &&
    destinatarioRazonSocial.trim() !== "" &&
    destinatarioDireccion.trim() !== "" &&
    transportistaIdentificacion.trim() !== "" &&
    transportistaRazonSocial.trim() !== "" &&
    placa.trim() !== "" &&
    dirPartida.trim() !== "";

  const generarGuia = useMutation({
    mutationFn: async () =>
      api.post("/guias-remision", {
        facturaId,
        destinatario: {
          tipoIdentificacion: destinatarioTipoIdentificacion,
          identificacion: destinatarioIdentificacion.trim(),
          razonSocial: destinatarioRazonSocial.trim(),
          direccion: destinatarioDireccion.trim(),
        },
        motivoTraslado,
        ruta: ruta.trim() || undefined,
        transportista: {
          tipoIdentificacion: transportistaTipoIdentificacion,
          identificacion: transportistaIdentificacion.trim(),
          razonSocial: transportistaRazonSocial.trim(),
        },
        placa: placa.trim(),
        dirPartida: dirPartida.trim(),
        fechaIniTransporte,
        fechaFinTransporte,
        items: itemsValidos.filter((it) => it.cantidadNum > 0).map((it) => ({ productoId: it.productoId, cantidad: it.cantidadNum })),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["guias-remision"] });
      mostrarToast("Guía de remisión generada", "success");
      onCerrar();
    },
    onError: (error: any) => {
      mostrarToast(error.response?.data?.error ?? "Error al generar la guía de remisión");
    },
  });

  return (
    <Modal titulo={`Generar guía de remisión — Fact. ${factura?.secuencial ?? ""}`} onCerrar={onCerrar} ancho="max-w-2xl">
      {isLoading && <p className="text-sm text-gray-400 dark:text-gray-500">Cargando...</p>}
      {factura && (
        <>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div className="col-span-2">
              <p className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Destinatario</p>
            </div>
            <div>
              <label className="block text-[10px] text-gray-500 dark:text-gray-400">Tipo de identificación</label>
              <select
                value={destinatarioTipoIdentificacion}
                onChange={(e) => setDestinatarioTipoIdentificacion(e.target.value)}
                className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded px-2 py-1 text-sm"
              >
                {TIPOS_IDENTIFICACION.map((t) => (
                  <option key={t.valor} value={t.valor}>{t.etiqueta}</option>
                ))}
                <option value="CONSUMIDOR_FINAL">Consumidor final</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] text-gray-500 dark:text-gray-400">Identificación</label>
              <input
                type="text"
                value={destinatarioIdentificacion}
                onChange={(e) => setDestinatarioIdentificacion(e.target.value)}
                className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded px-2 py-1 text-sm"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-[10px] text-gray-500 dark:text-gray-400">Razón social</label>
              <input
                type="text"
                value={destinatarioRazonSocial}
                onChange={(e) => setDestinatarioRazonSocial(e.target.value)}
                className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded px-2 py-1 text-sm"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-[10px] text-gray-500 dark:text-gray-400">Dirección de entrega</label>
              <input
                type="text"
                value={destinatarioDireccion}
                onChange={(e) => setDestinatarioDireccion(e.target.value)}
                className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded px-2 py-1 text-sm"
              />
            </div>
            <div>
              <label className="block text-[10px] text-gray-500 dark:text-gray-400">Motivo del traslado</label>
              <select
                value={motivoTraslado}
                onChange={(e) => setMotivoTraslado(e.target.value)}
                className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded px-2 py-1 text-sm"
              >
                {MOTIVOS_TRASLADO.map((m) => (
                  <option key={m.valor} value={m.valor}>{m.etiqueta}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] text-gray-500 dark:text-gray-400">Ruta (opcional)</label>
              <input
                type="text"
                value={ruta}
                onChange={(e) => setRuta(e.target.value)}
                className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded px-2 py-1 text-sm"
              />
            </div>
          </div>

          <div className="border-t border-gray-200 dark:border-gray-700 pt-3 grid grid-cols-2 gap-3 mb-3">
            <div className="col-span-2">
              <p className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Transportista y vehículo</p>
            </div>
            <div>
              <label className="block text-[10px] text-gray-500 dark:text-gray-400">Tipo de identificación</label>
              <select
                value={transportistaTipoIdentificacion}
                onChange={(e) => setTransportistaTipoIdentificacion(e.target.value)}
                className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded px-2 py-1 text-sm"
              >
                {TIPOS_IDENTIFICACION.map((t) => (
                  <option key={t.valor} value={t.valor}>{t.etiqueta}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] text-gray-500 dark:text-gray-400">Identificación</label>
              <input
                type="text"
                value={transportistaIdentificacion}
                onChange={(e) => setTransportistaIdentificacion(e.target.value)}
                className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded px-2 py-1 text-sm"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-[10px] text-gray-500 dark:text-gray-400">Razón social del transportista</label>
              <input
                type="text"
                value={transportistaRazonSocial}
                onChange={(e) => setTransportistaRazonSocial(e.target.value)}
                className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded px-2 py-1 text-sm"
              />
            </div>
            <div>
              <label className="block text-[10px] text-gray-500 dark:text-gray-400">Placa</label>
              <input
                type="text"
                value={placa}
                onChange={(e) => setPlaca(e.target.value.toUpperCase())}
                className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded px-2 py-1 text-sm"
              />
            </div>
            <div>
              <label className="block text-[10px] text-gray-500 dark:text-gray-400">Dirección de partida</label>
              <input
                type="text"
                value={dirPartida}
                onChange={(e) => setDirPartida(e.target.value)}
                className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded px-2 py-1 text-sm"
              />
            </div>
            <div>
              <label className="block text-[10px] text-gray-500 dark:text-gray-400">Fecha inicio traslado</label>
              <input
                type="date"
                value={fechaIniTransporte}
                onChange={(e) => setFechaIniTransporte(e.target.value)}
                className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded px-2 py-1 text-sm"
              />
            </div>
            <div>
              <label className="block text-[10px] text-gray-500 dark:text-gray-400">Fecha fin traslado</label>
              <input
                type="date"
                value={fechaFinTransporte}
                onChange={(e) => setFechaFinTransporte(e.target.value)}
                className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded px-2 py-1 text-sm"
              />
            </div>
          </div>

          <div className="border-t border-gray-200 dark:border-gray-700 pt-3 mb-3">
            <p className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-2">
              Bienes a transportar (cantidad facturada por defecto — ajusta si el envío no viaja completo)
            </p>
            <div className="space-y-2">
              {items.map((it) => {
                const cantidadNum = parseInt(it.cantidad, 10) || 0;
                const excede = cantidadNum > it.cantidadFacturada;
                return (
                  <div key={it.productoId} className="flex items-center justify-between text-sm border-b border-gray-100 dark:border-gray-700 pb-1">
                    <div>
                      <p className="text-gray-800 dark:text-gray-100">{it.nombre}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Facturado: {it.cantidadFacturada}</p>
                    </div>
                    <input
                      type="number"
                      min={0}
                      max={it.cantidadFacturada}
                      value={it.cantidad}
                      onChange={(e) => actualizarCantidad(it.productoId, e.target.value)}
                      className={`w-20 border rounded px-2 py-1 text-center bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 ${excede ? "border-red-500" : "border-gray-300 dark:border-gray-600"}`}
                    />
                  </div>
                );
              })}
            </div>
            {algunaCantidadExcede && (
              <p className="text-xs text-red-600 dark:text-red-400 mt-2">
                Ninguna cantidad puede superar lo facturado en esa línea.
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={() => generarGuia.mutate()}
            disabled={!formularioValido || generarGuia.isPending}
            className="w-full bg-emerald-600 text-white py-2 rounded-md text-sm font-medium hover:bg-emerald-700 disabled:opacity-40"
          >
            {generarGuia.isPending ? "Generando..." : "Generar guía de remisión"}
          </button>
          {generarGuia.isError && (
            <p className="text-red-600 dark:text-red-400 text-sm mt-2">
              {(generarGuia.error as any)?.response?.data?.error ?? "Error al generar la guía de remisión"}
            </p>
          )}
        </>
      )}
    </Modal>
  );
}
