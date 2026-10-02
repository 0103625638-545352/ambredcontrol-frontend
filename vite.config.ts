import { defineConfig } from 'vite'
import { existsSync, readFileSync } from 'fs'
import { resolve } from 'path'
import { networkInterfaces } from 'os'
import { execFileSync } from 'child_process'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Certificado local (mkcert) para poder entrar por HTTPS desde el celular en
// la misma red — el GPS del navegador (navigator.geolocation, que usa "Mi
// ruta de hoy" para el botón "Llegué") solo funciona en un "contexto
// seguro": HTTPS, o localhost. Por IP LAN sin HTTPS, el navegador lo bloquea
// aunque el usuario dé el permiso.
//
// Desde 2026-09-22 la IP y el certificado se detectan solos en cada arranque
// (antes había que regenerar el certificado y editar este archivo a mano
// cada vez que la PC cambiaba de IP — WiFi <-> cable, DHCP, otra red). El
// mismo mecanismo está espejado en backend/src/utils/httpsLocal.ts: ambos
// detectan la IP por su cuenta y arman el mismo nombre de archivo, así
// terminan usando el mismo certificado sin coordinarse entre sí. Requiere
// mkcert instalado y con "mkcert -install" corrido una vez en esta PC — si
// no está, sigue por HTTP plano como siempre (no rompe el flujo normal).
const carpetaCerts = resolve(__dirname, '../certs-local-dev')

function obtenerIpLan(): string | undefined {
  const interfaces = networkInterfaces()
  for (const [nombre, direcciones] of Object.entries(interfaces)) {
    if (!direcciones) continue
    // Descarta adaptadores virtuales (Hyper-V, WSL, VPN, loopback) — solo
    // interesa la tarjeta real (Wi-Fi o Ethernet) por la que entra el celular.
    if (/vEthernet|Virtual|Loopback|Hyper-V|WSL/i.test(nombre)) continue
    for (const dir of direcciones) {
      if (dir.family === 'IPv4' && !dir.internal) return dir.address
    }
  }
  return undefined
}

function resolverHttpsLocal(): { cert: Buffer; key: Buffer } | undefined {
  const ip = obtenerIpLan()
  if (!ip) return undefined

  const rutaCert = resolve(carpetaCerts, `${ip}+3.pem`)
  const rutaKey = resolve(carpetaCerts, `${ip}+3-key.pem`)

  if (!existsSync(rutaCert) || !existsSync(rutaKey)) {
    try {
      execFileSync('mkcert', [ip, 'localhost', '127.0.0.1', '::1'], { cwd: carpetaCerts, stdio: 'inherit' })
    } catch (err) {
      console.warn(
        `[https-local] No se pudo generar el certificado automáticamente para ${ip}. ¿mkcert está instalado y en el PATH? Sigue por HTTP plano. Detalle:`,
        err,
      )
      return undefined
    }
  }

  return existsSync(rutaCert) && existsSync(rutaKey)
    ? { cert: readFileSync(rutaCert), key: readFileSync(rutaKey) }
    : undefined
}

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // Escucha en todas las interfaces de red (no solo localhost) para poder
    // entrar desde el celular u otro equipo de la misma red por la IP LAN
    // de esta máquina — el backend se ubica solo (ver frontend/src/api/client.ts).
    host: true,
    // Solo hace falta al levantar el servidor de desarrollo — "vite build"
    // no sirve nada por HTTPS, así que no vale la pena detectar IP ni tocar
    // mkcert en ese caso.
    https: command === 'serve' ? resolverHttpsLocal() : undefined,
  },
}))
