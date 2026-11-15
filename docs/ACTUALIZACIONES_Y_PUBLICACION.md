# Actualizaciones, instalador y publicación

LUMEN adapta el flujo de [Cantoral](https://github.com/xlCyanz/cantoral): consulta silenciosa de la última versión, una preferencia de arranque, descarga con progreso y una instalación solicitada por el operador. Cantoral usa Tauri y `latest.json`; LUMEN usa Electron, `electron-updater`, un instalador NSIS y `latest.yml`. No se reutilizan las claves ni las firmas de Cantoral.

El repositorio y las publicaciones son [elorenzog/lumen](https://github.com/elorenzog/lumen). El proveedor de actualizaciones está fijado a ese repositorio; no acepta una URL enviada desde el control remoto. La descarga verifica el SHA-512 del artefacto según el manifiesto de Electron. Las publicaciones también incluyen SHA-256 para comprobación manual. No hay certificados Authenticode configurados en esta versión; Windows puede advertir que el editor no está verificado.

## Publicar una versión

1. Actualiza `package.json` y añade su sección en `CHANGELOG.md`.
2. Ejecuta `pnpm exec tsc --noEmit`, `pnpm test` y `pnpm build`.
3. Confirma los cambios y publica una etiqueta `v` seguida de la versión, por ejemplo `v0.8.0`.
4. `.github/workflows/release.yml` vuelve a comprobar la aplicación, crea el instalador y portable de Windows, genera sumas y adjunta los archivos a GitHub Releases. La etiqueta debe coincidir con `package.json`.

La ejecución manual del workflow genera artefactos para descargar, sin publicar una versión. El token temporal de GitHub Actions solo se utiliza en el servidor de compilación; no se incluye en la aplicación.

## Comportamiento en la iglesia

En **Ajustes → Acerca de LUMEN**, `Buscar ahora` consulta GitHub. El operador elige cuándo descargar y después cuándo instalar. No hay descarga ni instalación automática al salir. No se instala mientras la proyección esté abierta o preparando un himno. La edición portable ofrece el instalador/publicaciones para reemplazarla manualmente.

La preferencia se guarda en `updates.json`, separada de Biblias, himnos y programa. Solo se consulta la información de la versión; no se sube el contenido local. El uso de la Biblia y el himnario sigue funcionando sin Internet.

## Biblias e himnos

El repositorio/instalador contiene RV1909 y BLL, con sus atribuciones existentes. Las otras traducciones se conservan en una carpeta local excluida de Git y se importan en cada PC desde **Ajustes → Traducciones sin conexión → Importar carpeta de Biblias**. Se validan los JSON de LUMEN, se conservan sus identificadores y no se duplican las ediciones ya instaladas. Los permisos y avisos de cada edición se conservan.

Los videos MKV y otros audios/videos de himnos, cachés, datos de usuario, respaldos, archivos de recuperación y credenciales no se añaden al repositorio ni al instalador. Los catálogos de títulos y correspondencias de numeración sí forman parte del código.
