import { useEffect, useRef, useState } from "react";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";
import { Modal } from "./Modal";

interface Props {
  onDetectado: (codigo: string) => void;
  onCerrar: () => void;
}

const ELEMENTO_ID = "escaner-codigo-barras";

// Escaneo de código de barras con la cámara del dispositivo (celular/tablet
// sin lector USB) — complementa el escaneo por lector físico que ya existe
// (tipear + Enter, en PuntoDeVentaPage). Formatos restringidos a los que se
// usan en retail: Code128 (código interno propio) + EAN-13/EAN-8/UPC-A/UPC-E
// (barcode real de fábrica).
export function EscanerCodigoBarras({ onDetectado, onCerrar }: Props) {
  const [error, setError] = useState<string | null>(null);
  const detectadoRef = useRef(false);

  useEffect(() => {
    const scanner = new Html5Qrcode(ELEMENTO_ID, {
      verbose: false,
      formatsToSupport: [
        Html5QrcodeSupportedFormats.CODE_128,
        Html5QrcodeSupportedFormats.EAN_13,
        Html5QrcodeSupportedFormats.EAN_8,
        Html5QrcodeSupportedFormats.UPC_A,
        Html5QrcodeSupportedFormats.UPC_E,
      ],
    });

    scanner
      .start(
        { facingMode: "environment" },
        { fps: 10, qrbox: 250 },
        (codigoDecodificado) => {
          // El primer frame que decodifica algo ya alcanza — sin esta guardia,
          // la cámara sigue escaneando mientras se cierra y puede disparar el
          // callback una segunda vez antes de que el stream termine de parar.
          if (detectadoRef.current) return;
          detectadoRef.current = true;
          onDetectado(codigoDecodificado);
        },
        () => {
          // Callback de "no se detectó nada en este frame" — se llama
          // constantemente mientras la cámara busca un código, no es un error.
        }
      )
      .catch(() => {
        setError("No se pudo acceder a la cámara. Revisa los permisos del navegador.");
      });

    // Crítico: si no se detiene el stream de la cámara al desmontar, queda
    // encendida en segundo plano aunque el modal ya esté cerrado.
    return () => {
      scanner.stop().then(() => scanner.clear()).catch(() => {});
    };
  }, [onDetectado]);

  return (
    <Modal titulo="Escanear código de barras" onCerrar={onCerrar}>
      {error ? (
        <p className="text-red-600 dark:text-red-400 text-sm">{error}</p>
      ) : (
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
          Apunta la cámara al código de barras del producto.
        </p>
      )}
      <div id={ELEMENTO_ID} className="rounded-md overflow-hidden" />
    </Modal>
  );
}
