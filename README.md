# LUMEN 0.9 · Tauri

**Biblia e Himnario Adventista** · La Palabra que ilumina, la alabanza que inspira.

Aplicación de escritorio en español para preparar pasajes, himnos y el programa del culto. La proyección ocupa la pantalla designada sin bordes ni barra de título, mientras el operador conserva su ventana. La Biblia, búsqueda y reproducción funcionan sin Internet.

## Descargar e instalar

Abre [las publicaciones de LUMEN](https://github.com/elorenzog/lumen/releases/latest).

- **LUMEN_*_x64-setup.exe**: instalador NSIS de Tauri para Windows x64, con accesos directos y actualizaciones verificadas por firma dentro de la aplicación.
- **latest.json** y **.exe.sig**: manifiesto y firma del actualizador Tauri.
- **SHA256SUMS.txt**: sumas de verificación de los archivos publicados.

La versión 0.9.0 utiliza Tauri 2 con un motor nativo en Rust. La primera instalación Tauri se realiza manualmente. El canal `latest.yml` de las versiones 0.8.x no actualiza Tauri. Haz un respaldo de tus datos y comprueba tus Biblias, videos y proyector al cambiar de distribución.

LUMEN usa WebView2 del sistema. Si falta, el instalador necesita Internet para obtenerlo; después, Biblia, búsqueda y reproducción funcionan sin conexión.

Los videos de himnos y las Biblias locales adicionales no se distribuyen. El instalador no tiene certificado Authenticode configurado; Windows puede mostrar una advertencia sobre el editor.

## Biblia e importación

Se incluyen **Reina-Valera 1909** y **Santa Biblia libre Latinoamericano (BLL)** con sus atribuciones. La fuente identifica BLL como borrador en revisión.

Busca referencias o palabras, compara traducciones y selecciona libro → capítulo → versículo. Puedes seleccionar hasta seis versículos y pulsar **Proyectar selección**; doble clic también proyecta. La proyección automática es opcional.

Admite JSON LUMEN/Scrollmapper, XML Zefania, USFM/SFM y ZIP de libros USFM. Para una colección de JSON de LUMEN, usa **Ajustes → Traducciones sin conexión → Importar carpeta de Biblias**. Conserva sus identificadores y omite las ediciones ya instaladas. Copia tu carpeta local a la nueva PC e impórtala allí; no se sube a GitHub. Se conservan avisos y permisos de cada edición. [Fuentes y formatos](docs/FUENTES_Y_TRADUCCIONES.md).

## Himnario y programa

Importa archivos o una carpeta de MKV con nombres como `001 Cantad alegres al Señor.mkv`, `001 - Cantad alegres al Señor.mkv` o `(001 Cantad alegres al Señor).mkv`. Los originales permanecen en su ubicación.

**Antiguo (1962)** y **Nuevo (2009)** usan su propia numeración. El antiguo conserva los 527 títulos: si no existe video vinculado indica **Canción no disponible**. Las correspondencias y conflictos se muestran en la ficha. No se descargan letras, canciones ni pistas con el catálogo.

Selecciona la pista cantada o instrumental del archivo. **Pausar** conserva su posición; **Detener** descarga el video y vuelve a la pantalla base. Cambiar de himno cancela preparaciones anteriores. Los videos H.264 compatibles se preparan sin recodificar la imagen y se reutiliza la caché local.

Puedes editar metadatos, marcar favoritos y preparar pasajes e himnos en **Programa**. La preparación es independiente de lo que está en vivo.

## Pantalla y apariencia

Conecta el proyector como pantalla extendida y selecciónalo en **Proyección**. En **Apariencia de la pantalla → Personalizar fondo y texto**, prepara colores, degradado, imagen/video silencioso, tipografía, alineación y márgenes. **Aplicar al proyector** confirma el borrador; **Cancelar** conserva el fondo activo.

En **Ajustes → Imagen de la pantalla base**, elige una imagen, ajusta si debe mostrarse completa o llenar la pantalla y pulsa **Aplicar cambios**. Se guarda una copia offline, independiente de los versículos y del video del himno.

## Control remoto desde un teléfono

Pulsa **Ajustes → Control remoto → Activar control remoto**. Conecta el teléfono a la misma red, abre la dirección indicada e introduce el PIN. Controla Biblia, himnos, programa, pistas, reproducción, posición, volumen, pantalla negra y pantalla base. Audio y video siguen saliendo desde la computadora.

**Renovar PIN** revoca los teléfonos vinculados; **Desactivar control** cierra el servidor. Reiniciar LUMEN comienza desactivado. El acceso HTTP está pensado para una red local de confianza y no permite importar ni borrar archivos. Si Windows solicita acceso, permite redes privadas. Las redes de invitados pueden aislar dispositivos.

## Actualizaciones y créditos

En **Ajustes → Acerca de LUMEN**, busca versiones de GitHub, elige si quieres comprobar al iniciar y descarga una actualización disponible. Instalar requiere una acción explícita y cerrar la proyección. No se reinicia automáticamente durante el culto.

| Desarrollador | Participación |
| --- | --- |
| Eliezer Lorenzo | Desarrollo y Diseño |
| Ezequiel Sierra | Desarrollo |

El flujo de publicaciones está inspirado en [Cantoral](https://github.com/xlCyanz/cantoral), adaptado a Tauri y NSIS con una clave propia de LUMEN. La firma del actualizador es independiente de un certificado Authenticode de Windows. [Cómo publicar una versión](docs/ACTUALIZACIONES_Y_PUBLICACION.md).

## Atajos

| Acción | Atajo |
| --- | --- |
| Referencia rápida | Ctrl + L |
| Versículo anterior / siguiente | Flechas izquierda / derecha, fuera de un campo de edición |
| Proyectar selección | Ctrl + Enter |
| Pantalla negra / restaurar | B, fuera de un campo de edición |
| Cerrar proyección | Esc en la ventana de salida |

## Desarrollo y verificación

Requisitos en Windows: Node.js 26, pnpm 10.32.1, Rust estable/MSVC, herramientas de C++ de Visual Studio y WebView2. [Requisitos de Tauri](https://v2.tauri.app/start/prerequisites/). La distribución usa un backend Rust y WebView2; no requiere Node.js en el equipo de destino.

```sh
pnpm install --frozen-lockfile
pnpm exec tsc --noEmit
pnpm test
node --test scripts/release-metadata.test.mjs
pnpm build
cargo fmt --manifest-path src-tauri/Cargo.toml --all --check
cargo check --manifest-path src-tauri/Cargo.toml --locked
cargo test --manifest-path src-tauri/Cargo.toml --locked
cargo clippy --manifest-path src-tauri/Cargo.toml --locked --all-targets -- -D warnings
pnpm dev
```

`pnpm build` compila la interfaz y prepara FFmpeg/FFprobe como recursos nativos. Para crear el instalador usa `pnpm tauri build --bundles nsis` con la clave de firma del actualizador configurada localmente. El workflow verifica JavaScript y Rust; una etiqueta de versión solo publica si dispone de la clave de firma. Si falta, genera un instalador de revisión sin feed y una advertencia; la ejecución manual nunca publica. [Instrucciones de firma y publicación](docs/ACTUALIZACIONES_Y_PUBLICACION.md).

Después de compilar, `pnpm test:e2e` ejecuta el flujo nativo de Tauri con datos aislados. La pantalla física y los teléfonos reales deben verificarse en el equipo de destino. macOS/Linux requieren compilación y pruebas en sus sistemas.

Tauri 2, Rust, TypeScript estricto, Vite, SQLite, Zod, Lucide y FFmpeg/FFprobe. [Avisos de terceros](THIRD_PARTY_NOTICES.md). No se incluyen NDI ni Chromecast.

Las pruebas actuales cubren la interfaz y los contratos compartidos en TypeScript, el motor nativo en Rust y los flujos completos en Tauri/WebView2. El conversor independiente de extractos BibleShow se encuentra en tools/bibleshow-conversion.ts y se ejecuta con node scripts/convert-bibleshow.mjs <entrada> <salida>. Las herramientas y pruebas del motor anterior fueron retiradas; sus versiones históricas siguen disponibles en Git.
