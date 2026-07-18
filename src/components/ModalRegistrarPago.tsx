import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type CuentaBancaria } from "../api/client";
import { Modal } from "./Modal";
import { useToast } from "./ToastProvider";

interface Props {
  // La misma forma de pago sirve para Factura (cuenta por cobrar) y Compra
  // (cuenta por pagar) — lo único que cambia es a qué ruta se postea y qué
  // queries invalidar, así que este modal es un solo componente reutilizado
  // en ambos lados en vez de dos casi-idénticos.
  endpoint: string; // ej. `/facturas/7/pagos` o `/compras/3/pagos`
  documento: string; // para el título: "factura 001-001-000000007"
  saldoPendiente: string;
  queryKeysAInvalidar: string[][];
  onCerrar: () => void;
  onPagado: () => void;
}

const FORMAS_PAGO = ["EFECTIVO", "TRANSFERENCIA", "TARJETA", "CHEQUE", "OTRO"];
// Solo estas 3 exigen elegir a qué cuenta bancaria de la empresa llegó/salió
// el dinero — EFECTIVO y OTRO se quedan igual que siempre (sin cuenta).
const FORMAS_QUE_EXIGEN_CUENTA = ["TRANSFERENCIA", "TARJETA", "CHEQUE"];

export function ModalRegistrarPago({
  endpoint,
  documento,
  saldoPendiente,
  queryKeysAInvalidar,
  onCerrar,
  onPagado,
}: Props) {
  const queryClient = useQueryClient();
  const { mostrarToast } = useToast();
  // OJO: a propósito NO se prellena con el saldo pendiente. Un usuario que
  // quería registrar un abono parcial y no se fija en que el campo ya trae
  // el total completo, termina pagando de más sin darse cuenta — mejor que
  // siempre lo escriba, con un botón aparte para el caso de pago completo.
  const [monto, setMonto] = useState("");
  const [formaPago, setFormaPago] = useState("EFECTIVO");
  const [referencia, setReferencia] = useState("");
  const [cuentaBancariaId, setCuentaBancariaId] = useState<number | "">("");

  const exigeCuentaBancaria = FORMAS_QUE_EXIGEN_CUENTA.includes(formaPago);
  const { data: cuentasBancarias } = useQuery({
    queryKey: ["cuentas-bancarias"],
    queryFn: async () => (await api.get<CuentaBancaria[]>("/cuentas-bancarias")).data,
    enabled: exigeCuentaBancaria,
  });

  const registrarPago = useMutation({
    mutationFn: async () => {
      return api.post(endpoint, {
        monto: parseFloat(monto),
        formaPago,
        referencia: referencia || undefined,
        cuentaBancariaId: exigeCuentaBancaria ? cuentaBancariaId : undefined,
      });
    },
    onSuccess: (respuesta) => {
      for (const queryKey of queryKeysAInvalidar) {
        queryClient.invalidateQueries({ queryKey });
      }
      mostrarToast("Pago registrado", "success");
      // Solo presente cuando este pago dejó PAGADA una factura de internet
      // (ver POST /facturas/:id/pagos) — el cliente ya se reactivó solo en
      // el Mikrotik, o no se pudo y hace falta que el admin lo sepa.
      const avisoInternet: string | undefined = respuesta.data?.avisoInternet;
      if (avisoInternet) {
        queryClient.invalidateQueries({ queryKey: ["mikrotik-ips-suspendidas"] });
        mostrarToast(avisoInternet, avisoInternet.startsWith("No se pudo") ? "error" : "success");
      }
      onPagado();
    },
    onError: (error: any) => {
      mostrarToast(error.response?.data?.error ?? "Error al registrar el pago");
    },
  });

  return (
    <Modal titulo={`Registrar pago — ${documento}`} onCerrar={onCerrar}>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
        Saldo pendiente: <span className="font-semibold text-gray-800 dark:text-gray-100">${saldoPendiente}</span>
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          registrarPago.mutate();
        }}
        className="space-y-3"
      >
        <div>
          <div className="flex justify-between items-center mb-1">
            <label className="block text-xs text-gray-600 dark:text-gray-400">Monto</label>
            <button
              type="button"
              onClick={() => setMonto(saldoPendiente)}
              className="text-xs text-emerald-700 dark:text-emerald-400 hover:underline"
            >
              Usar saldo completo (${saldoPendiente})
            </button>
          </div>
          <input
            type="number"
            step="0.01"
            min="0.01"
            max={saldoPendiente}
            required
            autoFocus
            placeholder="0.00"
            value={monto}
            onChange={(e) => setMonto(e.target.value)}
            className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Forma de pago</label>
          <select
            value={formaPago}
            onChange={(e) => {
              setFormaPago(e.target.value);
              setCuentaBancariaId("");
            }}
            className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm"
          >
            {FORMAS_PAGO.map((forma) => (
              <option key={forma} value={forma}>
                {forma}
              </option>
            ))}
          </select>
        </div>
        {exigeCuentaBancaria && (
          <div>
            <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Cuenta bancaria</label>
            {cuentasBancarias?.length === 0 ? (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                No hay cuentas bancarias configuradas — créalas en Administración &gt; Cuentas Bancarias.
              </p>
            ) : (
              <select
                required
                value={cuentaBancariaId}
                onChange={(e) => setCuentaBancariaId(Number(e.target.value))}
                className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm"
              >
                <option value="" disabled>
                  Selecciona una cuenta
                </option>
                {cuentasBancarias?.map((cb) => (
                  <option key={cb.id} value={cb.id}>
                    {cb.nombre} — {cb.banco} {cb.numeroCuenta}
                  </option>
                ))}
              </select>
            )}
          </div>
        )}
        <div>
          <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Referencia (opcional)</label>
          <input
            type="text"
            placeholder="Ej: número de comprobante de transferencia"
            value={referencia}
            onChange={(e) => setReferencia(e.target.value)}
            className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm"
          />
        </div>
        <button
          type="submit"
          disabled={registrarPago.isPending || (exigeCuentaBancaria && !cuentaBancariaId)}
          className="w-full bg-emerald-600 text-white py-2 rounded-md text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
        >
          {registrarPago.isPending ? "Registrando..." : "Registrar pago"}
        </button>
      </form>
    </Modal>
  );
}
