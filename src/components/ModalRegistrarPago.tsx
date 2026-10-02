import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type CuentaBancaria, type Cuota } from "../api/client";
import { Modal } from "./Modal";
import { SelectorBanco } from "./SelectorBanco";
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
  // Datos de ORIGEN del pago (banco/cuenta/tarjeta de quien pagó) — cuáles se
  // piden depende de formaPago, ver los bloques condicionales más abajo.
  const [bancoOrigenId, setBancoOrigenId] = useState<number | "">("");
  const [numeroCuentaOrigen, setNumeroCuentaOrigen] = useState("");
  const [tarjetaUltimosDigitos, setTarjetaUltimosDigitos] = useState("");
  const [tarjetaTipo, setTarjetaTipo] = useState("DEBITO");
  const [tarjetaReferencia, setTarjetaReferencia] = useState("");
  const [tarjetaLote, setTarjetaLote] = useState("");
  const [chequeNumero, setChequeNumero] = useState("");
  const [chequeFechaCobro, setChequeFechaCobro] = useState("");

  const exigeCuentaBancaria = FORMAS_QUE_EXIGEN_CUENTA.includes(formaPago);
  const { data: cuentasBancarias } = useQuery({
    queryKey: ["cuentas-bancarias"],
    queryFn: async () => (await api.get<CuentaBancaria[]>("/cuentas-bancarias")).data,
    enabled: exigeCuentaBancaria,
  });

  // Si este documento tiene un plan de Cuotas (ver modelo Cuota), el cobro
  // es ESTRICTO: solo se puede pagar la próxima pendiente, en orden, y por
  // su monto EXACTO — el backend lo vuelve a validar igual, esto es solo
  // para que el monto ya venga bien puesto y no haga falta adivinarlo.
  // `endpoint` viene como ".../pagos"; el documento en sí vive un nivel
  // arriba. Compras no tiene Cuota, así que ahí "cuotas" simplemente no
  // viene en la respuesta y este bloque no cambia nada.
  const endpointBase = endpoint.replace(/\/pagos$/, "");
  const { data: documentoConCuotas } = useQuery({
    queryKey: ["documento-para-pago", endpointBase],
    queryFn: async () => (await api.get<{ cuotas?: Cuota[] }>(endpointBase)).data,
  });
  const proximaCuota = documentoConCuotas?.cuotas?.find((c: Cuota) => c.estado === "PENDIENTE");

  useEffect(() => {
    if (proximaCuota) setMonto(proximaCuota.monto);
  }, [proximaCuota?.id, proximaCuota?.monto]);

  const registrarPago = useMutation({
    mutationFn: async () => {
      return api.post(endpoint, {
        monto: parseFloat(monto),
        formaPago,
        referencia: referencia || undefined,
        cuentaBancariaId: exigeCuentaBancaria ? cuentaBancariaId : undefined,
        bancoOrigenId: formaPago === "TRANSFERENCIA" || formaPago === "TARJETA" || formaPago === "CHEQUE" ? bancoOrigenId || undefined : undefined,
        numeroCuentaOrigen: formaPago === "TRANSFERENCIA" ? numeroCuentaOrigen || undefined : undefined,
        tarjetaUltimosDigitos: formaPago === "TARJETA" ? tarjetaUltimosDigitos || undefined : undefined,
        tarjetaTipo: formaPago === "TARJETA" ? tarjetaTipo : undefined,
        tarjetaReferencia: formaPago === "TARJETA" ? tarjetaReferencia || undefined : undefined,
        tarjetaLote: formaPago === "TARJETA" ? tarjetaLote || undefined : undefined,
        chequeNumero: formaPago === "CHEQUE" ? chequeNumero || undefined : undefined,
        chequeFechaCobro: formaPago === "CHEQUE" ? chequeFechaCobro || undefined : undefined,
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
        {proximaCuota && (
          <p className="text-xs bg-sky-50 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300 rounded-md px-3 py-2">
            Este documento tiene un plan de cuotas — hay que pagar la <strong>cuota {proximaCuota.numero}</strong>{" "}
            (vence {new Date(proximaCuota.fechaVencimiento).toLocaleDateString("es-EC")}) por su monto exacto, en
            orden.
          </p>
        )}
        <div>
          <div className="flex justify-between items-center mb-1">
            <label className="block font-mono text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500">Monto</label>
            {!proximaCuota && (
              <button
                type="button"
                onClick={() => setMonto(saldoPendiente)}
                className="text-xs text-emerald-700 dark:text-emerald-400 hover:underline"
              >
                Usar saldo completo (${saldoPendiente})
              </button>
            )}
          </div>
          <input
            type="number"
            step="0.01"
            min="0.01"
            max={saldoPendiente}
            required
            autoFocus
            readOnly={!!proximaCuota}
            placeholder="0.00"
            value={monto}
            onChange={(e) => setMonto(e.target.value)}
            className={`w-full border border-stone-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm text-gray-900 dark:text-gray-100 ${
              proximaCuota ? "bg-stone-100 dark:bg-gray-900" : "bg-white dark:bg-gray-700"
            }`}
          />
        </div>
        <div>
          <label className="block font-mono text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1">Forma de pago</label>
          <select
            value={formaPago}
            onChange={(e) => {
              setFormaPago(e.target.value);
              setCuentaBancariaId("");
              setBancoOrigenId("");
            }}
            className="w-full border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-2 py-1.5 text-sm"
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
            <label className="block font-mono text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1">Cuenta bancaria</label>
            {cuentasBancarias?.length === 0 ? (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                No hay cuentas bancarias configuradas — créalas en Administración &gt; Cuentas Bancarias.
              </p>
            ) : (
              <select
                required
                value={cuentaBancariaId}
                onChange={(e) => setCuentaBancariaId(Number(e.target.value))}
                className="w-full border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-2 py-1.5 text-sm"
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
        {formaPago === "TRANSFERENCIA" && (
          <div className="grid grid-cols-2 gap-3">
            <SelectorBanco value={bancoOrigenId} onChange={setBancoOrigenId} label="Banco de procedencia" />
            <div>
              <label className="block font-mono text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1">N° de cuenta de origen</label>
              <input
                type="text"
                placeholder="Cuenta de la que salió el dinero"
                value={numeroCuentaOrigen}
                onChange={(e) => setNumeroCuentaOrigen(e.target.value)}
                className="w-full border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-2 py-1.5 text-sm"
              />
            </div>
          </div>
        )}
        {formaPago === "TARJETA" && (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <SelectorBanco value={bancoOrigenId} onChange={setBancoOrigenId} label="Banco emisor" />
              <div>
                <label className="block font-mono text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1">Últimos 4 dígitos</label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={4}
                  placeholder="1234"
                  value={tarjetaUltimosDigitos}
                  onChange={(e) => setTarjetaUltimosDigitos(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  className="w-full border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-2 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="block font-mono text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1">Tipo</label>
                <select
                  value={tarjetaTipo}
                  onChange={(e) => setTarjetaTipo(e.target.value)}
                  className="w-full border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-2 py-1.5 text-sm"
                >
                  <option value="DEBITO">Débito</option>
                  <option value="CREDITO">Crédito</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-mono text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1">N° de referencia</label>
                <input
                  type="text"
                  placeholder="Del voucher del datáfono"
                  value={tarjetaReferencia}
                  onChange={(e) => setTarjetaReferencia(e.target.value)}
                  className="w-full border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-2 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="block font-mono text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1">N° de lote</label>
                <input
                  type="text"
                  placeholder="Del voucher del datáfono"
                  value={tarjetaLote}
                  onChange={(e) => setTarjetaLote(e.target.value)}
                  className="w-full border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-2 py-1.5 text-sm"
                />
              </div>
            </div>
          </div>
        )}
        {formaPago === "CHEQUE" && (
          <div className="grid grid-cols-3 gap-3">
            <SelectorBanco value={bancoOrigenId} onChange={setBancoOrigenId} label="Banco emisor" />
            <div>
              <label className="block font-mono text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1">N° de cheque</label>
              <input
                type="text"
                placeholder="Ej: 000123"
                value={chequeNumero}
                onChange={(e) => setChequeNumero(e.target.value)}
                className="w-full border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block font-mono text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1">Fecha de cobro</label>
              <input
                type="date"
                value={chequeFechaCobro}
                onChange={(e) => setChequeFechaCobro(e.target.value)}
                className="w-full border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-2 py-1.5 text-sm"
              />
            </div>
          </div>
        )}
        <div>
          <label className="block font-mono text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1">Referencia (opcional)</label>
          <input
            type="text"
            placeholder="Ej: número de comprobante de transferencia"
            value={referencia}
            onChange={(e) => setReferencia(e.target.value)}
            className="w-full border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-2 py-1.5 text-sm"
          />
        </div>
        <button
          type="submit"
          disabled={registrarPago.isPending || (exigeCuentaBancaria && !cuentaBancariaId)}
          className="w-full bg-brand-700 text-white py-2 rounded-md text-sm font-semibold hover:bg-brand-800 disabled:opacity-50"
        >
          {registrarPago.isPending ? "Registrando..." : "Registrar pago"}
        </button>
      </form>
    </Modal>
  );
}
