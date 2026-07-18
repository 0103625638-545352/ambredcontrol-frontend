import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import { api, type HistorialClienteItem, type VisitaHistorialCliente } from "../api/client";
import { Modal } from "./Modal";
import { EstadoBadge } from "./EstadoBadge";
import { TarjetaVisitaDetalle } from "./TarjetaVisitaDetalle";

interface Props {
  clienteId: number;
  nombreCliente: string;
  onCerrar: () => void;
}

const etiquetasTipo: Record<HistorialClienteItem["tipo"], string> = {
  FACTURA: "Factura",
  NOTA_VENTA: "Nota de venta",
};

const ETIQUETA_ESTADO_VISITA: Record<string, string> = {
  PENDIENTE: "Pendiente",
  COMPLETADA: "Completada",
  OMITIDA: "Omitida",
};

// Qué productos se le han vendido a este cliente (pestaña "Compras"), y por
// separado qué visitas técnicas se le han hecho — instalaciones, cambios de
// domicilio, cambios de equipo — con el acta y las fotos de cada una
// (pestaña "Visitas técnicas"). Dos historiales distintos del mismo cliente,
// en el mismo lugar para no tener que ir a buscarlos por separado.
export function HistorialClienteModal({ clienteId, nombreCliente, onCerrar }: Props) {
  const [pestana, setPestana] = useState<"compras" | "visitas">("compras");

  const { data, isLoading } = useQuery({
    queryKey: ["historial-cliente", clienteId],
    queryFn: async () => (await api.get<HistorialClienteItem[]>(`/clientes/${clienteId}/historial`)).data,
    enabled: pestana === "compras",
  });

  const { data: visitas, isLoading: cargandoVisitas } = useQuery({
    queryKey: ["historial-visitas-cliente", clienteId],
    queryFn: async () => (await api.get<VisitaHistorialCliente[]>(`/clientes/${clienteId}/historial-visitas`)).data,
    enabled: pestana === "visitas",
  });

  function exportarExcelCompras() {
    if (!data || data.length === 0) return;
    const hoja = XLSX.utils.json_to_sheet(
      data.map((item) => ({
        Fecha: new Date(item.fecha).toLocaleDateString("es-EC"),
        Tipo: etiquetasTipo[item.tipo],
        Documento: item.documento,
        Producto: item.producto,
        Cantidad: item.cantidad,
        "Precio unitario": item.precioUnitario,
        Estado: item.estado,
      }))
    );
    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, hoja, "Compras");
    XLSX.writeFile(libro, `historial-compras-${nombreCliente}.xlsx`);
  }

  function exportarExcelVisitas() {
    if (!visitas || visitas.length === 0) return;
    const filas = visitas.flatMap((v) => {
      const base = {
        Fecha: new Date(v.rutaVisita.fecha).toLocaleDateString("es-EC"),
        Técnico: `${v.rutaVisita.empleado.nombres} ${v.rutaVisita.empleado.apellidos}`,
        Estado: ETIQUETA_ESTADO_VISITA[v.estado],
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
    XLSX.writeFile(libro, `historial-visitas-${nombreCliente}.xlsx`);
  }

  return (
    <Modal
      titulo={`Historial de "${nombreCliente}"`}
      onCerrar={onCerrar}
      ancho="max-w-3xl"
      accionExtra={
        ((pestana === "compras" && data && data.length > 0) || (pestana === "visitas" && visitas && visitas.length > 0)) && (
          <button
            onClick={pestana === "compras" ? exportarExcelCompras : exportarExcelVisitas}
            className="bg-emerald-600 text-white px-3 py-1.5 rounded-md text-xs font-medium hover:bg-emerald-700"
          >
            Exportar a Excel
          </button>
        )
      }
    >
      <div className="flex gap-4 border-b border-gray-200 dark:border-gray-700 mb-4">
        <button
          onClick={() => setPestana("compras")}
          className={`pb-2 text-sm font-medium border-b-2 -mb-px ${
            pestana === "compras"
              ? "border-slate-700 dark:border-slate-300 text-slate-800 dark:text-slate-100"
              : "border-transparent text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
          }`}
        >
          Compras
        </button>
        <button
          onClick={() => setPestana("visitas")}
          className={`pb-2 text-sm font-medium border-b-2 -mb-px ${
            pestana === "visitas"
              ? "border-slate-700 dark:border-slate-300 text-slate-800 dark:text-slate-100"
              : "border-transparent text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
          }`}
        >
          Visitas técnicas
        </button>
      </div>

      {pestana === "compras" && (
        <>
          {isLoading && <p className="text-sm text-gray-400 dark:text-gray-500">Cargando...</p>}
          {!isLoading && data?.length === 0 && (
            <p className="text-sm text-gray-400 dark:text-gray-500">Este cliente todavía no tiene facturas ni notas de venta.</p>
          )}
          {data && data.length > 0 && (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-900/50 text-left text-gray-600 dark:text-gray-300">
                <tr>
                  <th className="px-3 py-2">Fecha</th>
                  <th className="px-3 py-2">Tipo</th>
                  <th className="px-3 py-2">Documento</th>
                  <th className="px-3 py-2">Producto</th>
                  <th className="px-3 py-2 text-right">Cantidad</th>
                  <th className="px-3 py-2 text-right">P. Unit.</th>
                  <th className="px-3 py-2">Estado</th>
                </tr>
              </thead>
              <tbody>
                {data.map((item, i) => (
                  <tr key={i} className="border-t border-gray-100 dark:border-gray-700">
                    <td className="px-3 py-2">{new Date(item.fecha).toLocaleDateString("es-EC")}</td>
                    <td className="px-3 py-2">{etiquetasTipo[item.tipo]}</td>
                    <td className="px-3 py-2 font-mono text-xs">{item.documento}</td>
                    <td className="px-3 py-2">{item.producto}</td>
                    <td className="px-3 py-2 text-right">{item.cantidad}</td>
                    <td className="px-3 py-2 text-right">${item.precioUnitario}</td>
                    <td className="px-3 py-2">
                      <EstadoBadge estado={item.estado} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}

      {pestana === "visitas" && (
        <div className="space-y-4">
          {cargandoVisitas && <p className="text-sm text-gray-400 dark:text-gray-500">Cargando...</p>}
          {!cargandoVisitas && visitas?.length === 0 && (
            <p className="text-sm text-gray-400 dark:text-gray-500">Este cliente todavía no ha recibido visitas técnicas.</p>
          )}
          {visitas?.map((v) => (
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
      )}
    </Modal>
  );
}
