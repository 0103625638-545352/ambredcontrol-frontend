# APK Android (app de técnicos)

La misma app React empaquetada con [Capacitor](https://capacitorjs.com) como app Android nativa. El motivo
principal es el **rastreo GPS en segundo plano** del técnico: un PWA deja de reportar cuando Android lo cierra.
Dentro del APK, el plugin `@capacitor-community/background-geolocation` levanta un servicio de ubicación en
primer plano (notificación fija "Compartiendo ubicación") que sigue funcionando con la pantalla apagada o
con el técnico en otra app. Detalles en `src/hooks/useUbicacionTecnico.ts`.

En el navegador/PWA nada cambia: todo lo nativo se activa solo si `Capacitor.isNativePlatform()`.

## Requisitos (una sola vez por PC)

- Android Studio (trae el Android SDK y un JDK 21 en `C:\Program Files\Android\Android Studio\jbr`).
- Gradle 8.14 **no** funciona con JDK 25. Antes de compilar, apuntar `JAVA_HOME` al JDK de Android Studio:
  - PowerShell: `$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"`

## Generar el APK de prueba (red local, sin servidor)

1. Copiar `.env.apk.example` como `.env.apk.local` y poner la IP LAN actual de la PC (`ipconfig`):
   `VITE_API_URL="https://192.168.1.182:3000"`. Dentro del APK la app no puede adivinar la URL del backend
   como en el navegador, así que queda fija al compilar. **Si la IP de la PC cambia, hay que recompilar.**
2. Backend corriendo con `HTTPS_LOCAL_AUTO="true"` (ya está así en `backend/.env`).
3. `npm run apk:debug` (desde `frontend/`). Resultado: `android/app/build/outputs/apk/debug/app-debug.apk`.
4. En el celular:
   - Instalar el certificado raíz `rootCA.pem` de la carpeta "certificados y docuemntos para celular"
     (Ajustes → Seguridad → Cifrado y credenciales → Instalar certificado → Certificado de CA). El APK de
     debug confía en él (`android/app/src/main/res/xml/network_security_config.xml`).
   - Pasar el APK e instalarlo (permitir "instalar apps de origen desconocido").
   - Al iniciar sesión como técnico, aceptar notificaciones y ubicación.
   - Recomendado: Ajustes → Batería → AmbrossISP PYMES → **Sin restricciones** (en Xiaomi/Huawei/Samsung
     esto marca mucha diferencia).

Para solo copiar cambios del frontend al proyecto Android (sin compilar), `npm run apk:sync`. Para abrirlo en
Android Studio (depurar, emulador, instalar por cable): `npx cap open android`.

**Límite:** si el técnico desliza la app fuera de "recientes", Android destruye la app y el rastreo se corta.
Cambiar de app, bloquear la pantalla o dejarla en segundo plano sí funciona.

## Pendiente para cuando haya servidor

1. **Dominio + HTTPS real** (Let's Encrypt) en el backend. Un APK *release* no acepta el certificado de mkcert.
2. Elegir cómo se entrega el frontend:
   - **Recomendado:** `server.url` en `capacitor.config.ts` apuntando al frontend publicado
     (`https://app.tudominio.com`). El APK carga la web desde el servidor, así los cambios del frontend llegan
     solos sin reinstalar. Solo hay que reinstalar si cambia algo nativo (plugins, permisos, ícono).
   - O seguir empaquetado: `.env.apk.local` con `VITE_API_URL="https://api.tudominio.com"` y recompilar en
     cada cambio.
3. CORS del backend: hoy `cors()` acepta cualquier origen. Si se restringe, incluir `https://localhost` (origen
   del APK en modo empaquetado).
4. **Firma de release:** crear un keystore (`keytool`), guardarlo fuera del repo con respaldo (perderlo impide
   actualizar el APK ya instalado) y compilar con `gradlew assembleRelease`.
5. Ícono propio de la app (hoy es el de Capacitor): `npx @capacitor/assets generate` o Android Studio →
   Image Asset.
