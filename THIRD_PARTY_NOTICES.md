# Componentes y fuentes de LUMEN

## Añadidos de LUMEN 0.2

- Santa Biblia libre Latinoamericano (BLL): dominio público, texto distribuido por fetch.bible; fuente y estado de borrador: https://ebible.org/Scriptures/details.php?id=spabll. Se conservan texto y numeración de la distribución. 31,095 entradas no vacías.
- fetch.bible: https://fetch.bible/access/manual/. El manifiesto de licencias se verifica antes de cada descarga y sus metadatos se guardan en la base local.
- usfm-js: MIT, https://github.com/unfoldingWord/usfm-js.
- fflate: MIT, https://github.com/101arrowz/fflate.
- ky: MIT, https://github.com/sindresorhus/ky.
- SQLite mediante `rusqlite` en el backend Rust de Tauri. SQLite se distribuye como dominio público: https://sqlite.org/copyright.html. Las versiones Electron anteriores usaban `node:sqlite`.

No se incorporan textos ni credenciales de API.Bible o AO Lab, ni bases morfológicas de STEPBible.

## Texto bíblico

Reina-Valera 1909: dominio público.

- Texto: https://ebible.org/Scriptures/spaRV1909_vpl.zip
- Declaración de dominio público: https://ebible.org/spaRV1909/copyright.htm
- Se normaliza únicamente la estructura de datos. Se eliminan las entradas vacías del VPL, sin renumerar ni completar por conjetura.

## Motor de escritorio e interfaz

- Tauri y sus plugins oficiales: MIT o Apache-2.0. https://github.com/tauri-apps/tauri y https://github.com/tauri-apps/plugins-workspace
- WebView2: motor web de Microsoft utilizado por Tauri en Windows; sujeto a los términos de Microsoft. https://developer.microsoft.com/microsoft-edge/webview2/
- NSIS: instalador de Windows; licencias zlib/libpng y de sus componentes. https://nsis.sourceforge.io/License
- rusqlite: MIT. https://github.com/rusqlite/rusqlite
- Tokio, Axum, Serde, Reqwest, parking_lot y thiserror: dependencias del backend Rust; sus licencias y versiones exactas se conservan en sus paquetes y en `src-tauri/Cargo.lock`.
- Electron (MIT) y electron-updater / electron-builder (MIT): usados en las distribuciones históricas hasta 0.8.x y herramientas de referencia. https://github.com/electron/electron y https://github.com/electron-userland/electron-builder
- Vite: MIT. https://github.com/vitejs/vite
- TypeScript: Apache-2.0. https://github.com/microsoft/TypeScript
- Zod: MIT. https://github.com/colinhacks/zod
- Lucide: ISC. https://github.com/lucide-icons/lucide
- fast-xml-parser: MIT. https://github.com/NaturalIntelligence/fast-xml-parser

Los textos completos de licencia de las dependencias se conservan en sus paquetes. Tauri usa el WebView del sistema; la distribución de LUMEN 0.9 no empaqueta Electron. Las publicaciones Electron anteriores conservan sus avisos LICENSE y LICENSES.chromium.html.

## FFmpeg / FFprobe

Se invocan como ejecutables independientes. Las compilaciones pueden incluir componentes GPL, entre ellos libx264. Las licencias y condiciones de estos binarios se aplican a su redistribución.

- ffmpeg-static: GPL-3.0-or-later. https://github.com/eugeneware/ffmpeg-static
- Binarios y documentación de compilación: https://github.com/eugeneware/ffmpeg-static/releases
- ffprobe-static: https://github.com/joshwnj/ffprobe-static
- FFmpeg y fuente: https://ffmpeg.org/download.html
- Información de licencia: https://ffmpeg.org/legal.html

Consulta las licencias y el origen exacto del binario antes de publicar paquetes fuera de tu entorno de uso. El código de LUMEN no afirma ser propietario de estos componentes.

## Referencia de diseño

BibleCast https://biblecast.app/ se consultó como referencia de organización visual. No se usan sus logos, capturas como interfaz ni módulos `.pack` en la aplicación.

El flujo de actualizaciones y publicaciones de Cantoral (https://github.com/xlCyanz/cantoral, MIT, Johan Sierra Linares) se estudió como referencia. LUMEN usa una implementación propia para Tauri/NSIS; no reutiliza su clave de actualizaciones ni sus firmas.
