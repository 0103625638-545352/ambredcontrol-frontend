import type { CapacitorConfig } from '@capacitor/cli'

// Configuración del APK Android (Capacitor) — la MISMA app React de siempre,
// empaquetada dentro de una app nativa para poder rastrear la ubicación del
// técnico en segundo plano (ver hooks/useUbicacionTecnico.ts: un PWA no puede,
// Android lo mata al cerrarlo). Cómo generar el APK: ver ANDROID.md.
//
// Por ahora el frontend va EMPAQUETADO dentro del APK (npm run apk:sync copia
// dist/ adentro) y la URL del backend queda fija al compilar vía
// VITE_API_URL en .env.apk.local. Cuando haya servidor con dominio propio, la
// idea es pasar a "server.url" (el APK carga la web desde el servidor, así
// los cambios del frontend llegan solos sin reinstalar) — ver ANDROID.md.
const config: CapacitorConfig = {
  appId: 'com.ambrossisp.pymes',
  appName: 'AmbrossISP PYMES',
  webDir: 'dist',
  android: {
    // Requisito del plugin de ubicación en segundo plano: sin esto Android
    // corta las lecturas a los ~5 min con la app en segundo plano (ver README
    // de @capacitor-community/background-geolocation, issue #89).
    useLegacyBridge: true,
  },
}

export default config
