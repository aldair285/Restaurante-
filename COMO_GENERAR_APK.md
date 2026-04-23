# Cómo generar tu APK (Android) — Sanguchería POS

Tu app ya está configurada como **PWA** (Progressive Web App), lo que significa que:
1. Se puede **instalar directamente desde Chrome** en cualquier celular Android (sin APK)
2. O puedes **generar un APK firmado** con **PWABuilder** en 3 minutos, sin instalar nada

---

## Paso 1 · Desplegar tu app

Antes de generar el APK necesitas una URL pública HTTPS (obligatorio para PWA):

1. En la plataforma Emergent, haz clic en **Deploy**
2. Espera 10–15 min
3. Copia la URL pública que te da (ej: `https://sangucheria-pos.preview.emergentagent.com`)

✅ La app ya está lista como PWA: manifest, iconos, service worker, theme color y meta tags están configurados.

---

## Opción A · Instalar como PWA (más rápido — 30 segundos)

### En Android (Chrome / Edge):
1. Abre la URL desplegada en **Chrome**
2. Toca el menú `⋮` → **"Instalar app"** o **"Agregar a pantalla de inicio"**
3. La app aparece como ícono en tu Android, se abre sin barra de navegador y funciona offline básico

### En iPhone (Safari):
1. Abre la URL en **Safari**
2. Toca el botón de compartir `□↑` → **"Agregar a pantalla de inicio"**

---

## Opción B · Generar APK firmado con PWABuilder (GRATIS, sin Android Studio)

### 1. Ir a PWABuilder
Abre **https://www.pwabuilder.com** en tu navegador.

### 2. Validar tu PWA
- Pega la URL pública de tu app en el input principal
- Click **"Start"**
- PWABuilder analizará tu PWA. Deberías ver puntuación alta en **Manifest** y **Service Worker** (ya están configurados correctamente).

### 3. Generar el APK
- En el dashboard, click **"Package for stores"** → **"Android"**
- Elige **"Options"** y configura (los valores por defecto funcionan):
  - **Package ID:** `com.sangucheria.pos` (ejemplo)
  - **App name:** `Sanguchería POS`
  - **Launcher name:** `POS`
  - **App version:** `1.0.0`
  - **Signing key:** `New` (PWABuilder te generará una firma y un `.keystore` para firmar futuras actualizaciones — **guárdalo muy bien**, lo necesitarás para actualizar la app)
- Click **"Generate"**
- Descargas un **.zip** con:
  - `app-release-signed.apk` ← el APK listo para instalar
  - `app-release-bundle.aab` ← el AAB (para subir a Google Play Store)
  - `signing-key-info.txt` ← credenciales de firma (guárdalo)
  - `assetlinks.json` ← para verificación de dominio

### 4. Instalar el APK en tu Android
Opción 1 — Directo al celular:
1. Pasa `app-release-signed.apk` a tu celular (USB, Drive, correo, WhatsApp)
2. En el celular, abre el archivo
3. Acepta "Instalar apps de fuentes desconocidas" si te lo pide
4. Instala ✅

Opción 2 — Publicar en Google Play Store:
1. Usa el `app-release-bundle.aab`
2. Crea cuenta de desarrollador en Google Play Console (pago único de $25 USD)
3. Sube el AAB y publica

---

## Paso (opcional) · Configurar `assetlinks.json` para Trusted Web Activity

Si quieres que tu APK abra en **modo sin barra de URL** (Trusted Web Activity oficial en lugar de WebView), tras descargar el paquete de PWABuilder:

1. Abre el `assetlinks.json` generado
2. Súbelo al backend en: `https://TU-DOMINIO/.well-known/assetlinks.json`
3. Reinstala la app

Para esto puedes agregar una ruta en FastAPI:
```python
from fastapi.responses import FileResponse
@app.get("/.well-known/assetlinks.json")
async def assetlinks():
    return FileResponse("/app/backend/assetlinks.json")
```

Y colocar el archivo `assetlinks.json` en `/app/backend/`.

---

## Qué se incluyó en tu app para que funcione como PWA

| Archivo | Propósito |
|---|---|
| `/app/frontend/public/manifest.json` | Metadatos de la app (nombre, iconos, theme, shortcuts) |
| `/app/frontend/public/sw.js` | Service worker — hace la app instalable y cachea estáticos |
| `/app/frontend/public/icon-*.png` | Iconos PWA 192/384/512 + maskable + Apple touch |
| `/app/frontend/public/index.html` | Meta tags mobile, viewport, theme-color |
| `/app/frontend/src/index.js` | Registro del service worker |

---

## Checklist rápido

- [ ] Desplegar app (botón **Deploy**)
- [ ] Verificar que abre con HTTPS
- [ ] Ir a **pwabuilder.com** y pegar URL
- [ ] Descargar paquete Android
- [ ] Instalar APK en celular o subir AAB a Play Store

✨ **Misma UI, mismas funciones, misma sincronización WebSocket — ahora en tu celular como app nativa.**
