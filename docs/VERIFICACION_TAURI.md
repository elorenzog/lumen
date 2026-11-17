# Verificación del motor nativo

Fecha: 16 de noviembre de 2026. Entorno ejecutado: Windows x64 con Tauri 2, Rust y WebView2.

## Resultados

- Instalación con `pnpm install --frozen-lockfile`: correcta.
- TypeScript estricto y compilación de producción: correctos.
- Pruebas de interfaz, contratos compartidos, recursos y conversor independiente: 64 aprobadas.
- Pruebas del motor Rust: 62 aprobadas. Formato y Clippy sin advertencias.
- Metadatos y firmas del instalador: 3 pruebas aprobadas.
- Clasificación de errores de recursos durante cancelaciones: aprobada.
- Conversor de extractos BibleShow: ejecutado sobre una entrada temporal; conserva el extracto original y genera el JSON y los recibos SHA-256.
- Prueba integral `node scripts/e2e-tauri.mjs`: aprobada con IPC nativo, descubrimiento de pantallas, Biblia sin conexión, búsquedas, selección de rangos, proyección, apariencia, programa, historial, importaciones, imágenes, MKV con dos audios, pausa, cambio de pista, cancelación y persistencia al reiniciar.

Las pruebas TypeScript del motor anterior se retiraron junto a su implementación. La suite actual utiliza las pruebas Rust del motor en uso. Se conserva por separado la comprobación de integridad de la Biblia incluida y el conversor de extractos BibleShow en `tools/`.

## Datos locales

La limpieza conserva las Biblias, las carpetas de himnos, los datos de usuario, las claves de firma y todas las distribuciones nativas. La comprobación de la base local mantiene sus 13 identificadores bíblicos y devuelve `PRAGMA quick_check = ok`.

## Alcance

Las pruebas integrales usan perfiles temporales aislados y archivos multimedia de prueba. Los resultados corresponden al entorno Windows ejecutado. El proyector físico, el audio de la iglesia y los permisos de red de teléfonos reales requieren comprobación en sus dispositivos.
