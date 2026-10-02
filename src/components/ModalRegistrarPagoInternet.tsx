import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type ClienteFacturableInternet, type CuentaBancaria } from "../api/client";
import { Modal } from "./Modal";
import { SelectorBanco } from "./SelectorBanco";
import { useToast } from "./ToastProvider";

interface Props {
  cliente: ClienteFacturableInternet;
  onCerrar: () => void;
  onPagado: () => void;
}

const FORMAS_PAGO = ["EFECTIVO", "TRANSFERENCIA", "TARJETA", "CHEQUE", "OTRO"];
const FORMAS_QUE_EXIGEN_CUENTA = ["TRANSFERENCIA", "TARJETA", "CHEQUE"];

// Ventana de pago DEDICADA a clientes de internet — a diferencia de
// "Registrar pago" en Facturas (que arranca desde un número de factura),
// acá el admin arranca desde EL CLIENTE. El backend decide solo qué hacer
// con el pago (ver POST /facturas-internet/:clienteId/pago): si ya existe
// una factura del plan sin pagar, se aplica ahí; si no (el caso normal
// entre el 01 y el 05, con miles de clientes pagando antes de que dé tiempo
// a facturar a cada uno), se guarda como COBRO ADELANTADO — la factura se
// genera después, en lote, con "Facturar a todos los pagados". Además
// permite adjuntar la captura del comprobante (transferencia/depósito) que
// el cliente mandó — se sube junto con el pago, en un solo guardado.
export function ModalRegistrarPagoInternet({ cliente, onCerrar, onPagado }: Props) {
  const queryClient = useQueryClient();
  const { mostrarToast } = useToast();

  const ultimaFactura = cliente.ultimaFacturaInternet;
  const hayFacturaPendiente = ultimaFactura && ultimaFactura.estadoPago !== "PAGADA";
  const saldoPendiente = hayFacturaPendiente
    ? (parseFloat(ultimaFactura!.total) - parseFloat(ultimaFactura!.montoPagado)).toFixed(2)
    : cliente.planInternet?.precio ?? "0.00";

  const [monto, setMonto] = useState("");
  const [formaPago, setFormaPago] = useState("EFECTIVO");
  const [referencia, setReferencia] = useState("");
  const [cuentaBancariaId, setCuentaBancariaId] = useState<number | "">("");
  const [comprobante, setComprobante] = useState<File | null>(null);
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

  const registrarPago = useMutation({
    mutationFn: async () => {
      const datosFormulario = new FormData();
      datosFormulario.append("monto", monto);
      datosFormulario.append("formaPago", formaPago);
      if (referencia) datosFormulario.append("referencia", referencia);
      if (exigeCuentaBancaria && cuentaBancariaId) datosFormulario.append("cuentaBancariaId", String(cuentaBancariaId));
      if (["TRANSFERENCIA", "TARJETA", "CHEQUE"].includes(formaPago) && bancoOrigenId) {
        datosFormulario.append("bancoOrigenId", String(bancoOrigenId));
      }
      if (formaPago === "TRANSFERENCIA" && numeroCuentaOrigen) datosFormulario.append("numeroCuentaOrigen", numeroCuentaOrigen);
      if (formaPago === "TARJETA") {
        if (tarjetaUltimosDigitos) datosFormulario.append("tarjetaUltimosDigitos", tarjetaUltimosDigitos);
        datosFormulario.append("tarjetaTipo", tarjetaTipo);
        if (tarjetaReferencia) datosFormulario.append("tarjetaReferencia", tarjetaReferencia);
        if (tarjetaLote) datosFormulario.append("tarjetaLote", tarjetaLote);
      }
      if (formaPago === "CHEQUE" && chequeNumero) datosFormulario.append("chequeNumero", chequeNumero);
      if (formaPago === "CHEQUE" && chequeFechaCobro) datosFormulario.append("chequeFechaCobro", chequeFechaCobro);
      if (comprobante) datosFormulario.append("comprobante", comprobante);
      return api.post(`/facturas-internet/${cliente.id}/pago`, datosFormulario);
    },
    onSuccess: (respuesta) => {
      queryClient.invalidateQueries({ queryKey: ["facturas-internet-clientes"] });
      queryClient.invalidateQueries({ queryKey: ["mikrotik-ips-suspendidas"] });
      // El backend decide solo si el pago se aplicó a una factura que ya
      // existía o si quedó como cobro adelantado (facturado: false) — el
      // mensaje avisa cuál de los dos pasó, para que no parezca que la
      // factura ya se generó cuando en realidad falta el paso en lote.
      const facturado: boolean = respuesta.data?.facturado;
      mostrarToast(facturado ? "Pago registrado contra su factura" : "Cobro registrado — se facturará con el resto en \"Facturar a todos los pagados\"", "success");
      const avisoInternet: string | undefined = respuesta.data?.avisoInternet;
      if (avisoInternet) {
        mostrarToast(avisoInternet, avisoInternet.startsWith("No se pudo") ? "error" : "success");
      }
      onPagado();
    },
    onError: (error: any) => {
      mostrarToast(error.response?.data?.error ?? "Error al registrar el pago");
    },
  });

  return (
    <Modal titulo={`Registrar pago — ${cliente.razonSocial}`} onCerrar={onCerrar}>
      <div className="text-sm bg-stone-50 dark:bg-gray-900/40 rounded-md p-3 mb-4">
        <p className="text-gray-800 dark:text-gray-100 font-medium">{cliente.razonSocial}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400">{cliente.identificacion} · {cliente.planInternet?.nombre} (${cliente.planInternet?.precio}/mes)</p>
        {hayFacturaPendiente ? (
          <p className="text-xs mt-1">
            Factura {ultimaFactura!.secuencial} · Saldo pendiente:{" "}
            <span className="font-semibold text-gray-800 dark:text-gray-100">${saldoPendiente}</span>
          </p>
        ) : (
          <p className="text-xs text-sky-600 dark:text-sky-400 mt-1">
            Todavía no tiene factura de este período — este pago queda como cobro adelantado y se factura después, junto con el resto, en "Facturar a todos los pagados".
          </p>
        )}
        {cliente.cobroPendiente && (
          <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
            Ya tiene {cliente.cobroPendiente.cantidad === 1 ? "un cobro registrado" : `${cliente.cobroPendiente.cantidad} cobros registrados`} sin facturar por ${cliente.cobroPendiente.total}.
          </p>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          registrarPago.mutate();
        }}
        className="space-y-3"
      >
        <div>
          <div className="flex justify-between items-center mb-1">
            <label className="block font-mono text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500">Monto</label>
            <button
              type="button"
              onClick={() => setMonto(saldoPendiente)}
              className="text-xs text-emerald-700 dark:text-emerald-400 hover:underline"
            >
              {hayFacturaPendiente ? `Usar saldo completo ($${saldoPendiente})` : `Usar precio del plan ($${saldoPendiente})`}
            </button>
          </div>
          <input
            type="number"
            step="0.01"
            min="0.01"
            max={hayFacturaPendiente ? saldoPendiente : undefined}
            required
            autoFocus
            placeholder="0.00"
            value={monto}
            onChange={(e) => setMonto(e.target.value)}
            className="w-full border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-2 py-1.5 text-sm"
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
            <label className="block font-mono text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1">Banco / cuenta que recibió el pago</label>
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
        <div>
          <label className="block font-mono text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1">Captura del pago (opcional)</label>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => setComprobante(e.target.files?.[0] ?? null)}
            className="w-full text-xs text-gray-600 dark:text-gray-300 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-medium file:bg-stone-100 dark:file:bg-gray-700 file:text-gray-700 dark:file:text-gray-200"
          />
          {comprobante && <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{comprobante.name}</p>}
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
