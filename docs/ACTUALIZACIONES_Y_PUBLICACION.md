# Actualizaciones, instalador y publicación

Desde 0.9.0, LUMEN usa Tauri 2, Rust y un instalador NSIS para Windows x64. El canal se fija a [elorenzog/lumen](https://github.com/elorenzog/lumen): `https://github.com/elorenzog/lumen/releases/latest/download/latest.json`. La aplicación incluye la clave pública del actualizador en `src-tauri/tauri.conf.json` y verifica la firma del instalador antes de instalarlo. Los archivos SHA-256 permiten comprobar manualmente las descargas.

La firma de Tauri autentica las actualizaciones. Es independiente de Authenticode: no hay certificado de editor de Windows configurado y Windows puede mostrar una advertencia.

## Primera instalación y cambio desde versiones 0.8.x

La publicación 0.8.1 corresponde al motor anterior y conserva su propio canal de actualización. Descarga e instala manualmente el instalador Tauri de la nueva publicación cuando esté disponible. Conserva un respaldo de tus datos y tus carpetas originales de Biblias y videos antes de cambiar de distribución; comprueba tus contenidos locales y la proyección en el equipo de destino.

El manifiesto `latest.yml` y los archivos `.blockmap` de las versiones 0.8.x no sirven para actualizar Tauri. El canal nuevo usa `latest.json` y la firma `.exe.sig` de Tauri. No se modifica la publicación 0.8.1 ni se reutiliza su manifiesto. Las actualizaciones posteriores dentro de Tauri comprueban la clave pública incluida en la aplicación.

## Compilar y verificar

En Windows se necesitan Node.js 26, pnpm 10.32.1, Rust estable con destino MSVC, las herramientas de C++ de Visual Studio y WebView2. Consulta los [requisitos oficiales de Tauri](https://v2.tauri.app/start/prerequisites/). La instalación NSIS usa WebView2 del sistema; si falta, su bootstrapper necesita Internet para obtenerlo. El uso diario de Biblia e himnario funciona sin Internet después de instalar las dependencias.

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
```

`pnpm build` prepara la interfaz, los archivos del control remoto y las herramientas multimedia nativas. `scripts/prepare-tauri.mjs` copia FFmpeg/FFprobe a `src-tauri/tools`, carpeta excluida de Git. El instalador empaqueta esos ejecutables; no necesita Node.js en el equipo de la iglesia.

## Firma local

La clave privada debe corresponder a la clave pública incluida en LUMEN. Guárdala fuera de Git y de los archivos públicos; no la imprimas, adjuntes ni copies a los artefactos. Puedes indicar su ruta local a la CLI sin leer su contenido:

```powershell
$env:TAURI_SIGNING_PRIVATE_KEY = 'C:\ruta-privada\lumen-updater.key'
# Si la clave tiene contraseña, proporciona TAURI_SIGNING_PRIVATE_KEY_PASSWORD en tu sesión.
pnpm tauri build --bundles nsis
Remove-Item Env:TAURI_SIGNING_PRIVATE_KEY
```

Tauri genera el instalador y su `.exe.sig` en `src-tauri/target/release/bundle/nsis`. Después ejecuta:

```sh
node scripts/release-metadata.mjs
```

El script exige un único instalador x64 de la versión actual, su firma y la sección correspondiente del changelog. Crea en `release/tauri` el instalador, la firma, `latest.json`, notas y `SHA256SUMS.txt`. La carpeta de salida debe estar vacía para evitar mezclar compilaciones. También admite rutas explícitas: `node scripts/release-metadata.mjs <carpeta-nsis> <salida-nueva>`.

`latest.json` contiene `version`, `notes`, `pub_date` RFC 3339 y `platforms.windows-x86_64` con `url` y el contenido real de `.exe.sig`. La URL apunta al instalador dentro de la etiqueta `v<versión>`. Una firma nunca se sustituye por una URL, una suma SHA-256 ni una firma de otra compilación. Véase el [actualizador oficial de Tauri](https://v2.tauri.app/plugin/updater/).

Para un instalador de revisión sin firma, usa una configuración adicional con `bundle.createUpdaterArtifacts=false` y prepara metadatos mediante `node scripts/release-metadata.mjs --unsigned`. Ese modo no produce `latest.json` ni `.sig` y no debe distribuirse por el canal de actualización.

## Publicar una versión

1. Sincroniza la versión en `package.json`, `src-tauri/tauri.conf.json` y `src-tauri/Cargo.toml`; actualiza `CHANGELOG.md` y el lockfile de Cargo si procede.
2. Ejecuta las verificaciones y prueba el instalador, la aplicación, la proyección física y el control remoto en Windows.
3. Para publicación automática, un administrador debe configurar explícitamente el secreto de repositorio `TAURI_SIGNING_PRIVATE_KEY` con la clave correspondiente. `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` se usa cuando la clave tiene contraseña. Configurar o transferir una clave privada requiere autorización específica de su responsable.
4. Cuando se haya decidido publicar, confirma los cambios y publica una etiqueta `v<versión>`. El workflow exige que coincida con las tres versiones y solo crea una nueva GitHub Release después de verificar y firmar correctamente.

La ejecución manual del workflow crea artefactos descargables y no publica una versión. Si falta el secreto, tanto una ejecución manual como una etiqueta generan una advertencia clara y un instalador sin firma para revisión; no se crea una GitHub Release ni un feed sin firma. Si la clave existe pero la firma falla, la compilación falla. El workflow no reemplaza publicaciones existentes.

Una alternativa es compilar y firmar localmente y, tras la autorización de publicación, adjuntar únicamente el instalador, su `.sig`, `latest.json`, notas y sumas a una nueva publicación. La clave privada permanece en el equipo. El token temporal de GitHub Actions no se incluye en LUMEN.

## Comportamiento en la iglesia

En **Ajustes → Acerca de LUMEN**, el operador consulta versiones, decide cuándo descargar y después cuándo instalar. La instalación requiere una acción explícita y cerrar la proyección; no se reinicia automáticamente durante el culto. Las preferencias de actualización se conservan separadas del contenido local. Buscar actualizaciones no sube Biblias, himnos ni datos del programa.

## Contenido del instalador

Se incluyen únicamente las Biblias RV1909 y BLL con sus atribuciones, los JSON de catálogos/correspondencias incluidos, la interfaz local del teléfono y FFmpeg/FFprobe. Las demás traducciones se importan en cada PC desde **Ajustes → Traducciones sin conexión → Importar carpeta de Biblias**.

Los videos MKV y demás audios/videos de himnos, cachés, bases de usuario, respaldos y credenciales permanecen locales. Las claves de firma no forman parte de los recursos. Conserva los avisos y permisos de cada traducción y las licencias de los binarios redistribuidos.

El flujo de publicaciones se estudió a partir de [Cantoral](https://github.com/xlCyanz/cantoral), adaptado a LUMEN con una clave y una implementación propias.
