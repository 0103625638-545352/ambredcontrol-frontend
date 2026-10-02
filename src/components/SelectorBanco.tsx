import { useQuery } from "@tanstack/react-query";
import { api, type Banco } from "../api/client";

interface Props {
  value: number | "";
  onChange: (id: number | "") => void;
  label: string;
}

// Select del catálogo de bancos EXTERNOS (ver Administración > Bancos) — se
// usa donde antes se escribía el banco de procedencia/emisor a mano
// (ModalRegistrarPago.tsx, ModalRegistrarPagoInternet.tsx,
// PuntoDeVentaPage.tsx), para evitar typos o variantes del mismo banco.
export function SelectorBanco({ value, onChange, label }: Props) {
  const { data: bancos } = useQuery({
    queryKey: ["bancos"],
    queryFn: async () => (await api.get<Banco[]>("/bancos")).data,
  });

  return (
    <div>
      <label className="block font-mono text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1">{label}</label>
      {bancos?.length === 0 ? (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          No hay bancos configurados — créalos en Administración &gt; Bancos.
        </p>
      ) : (
        <select
          value={value}
          onChange={(e) => onChange(e.target.value ? Number(e.target.value) : "")}
          className="w-full border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-2 py-1.5 text-sm"
        >
          <option value="">Selecciona un banco...</option>
          {bancos?.map((b) => (
            <option key={b.id} value={b.id}>
              {b.nombre}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
