# Cambios de LUMEN

## 0.9.2

- Pantalla base personalizable y ajuste de la posición del indicador animado de carga de himnos.
- Fundido rápido al abrir o restaurar la proyección. Al quitar contenido o cerrar la salida, el fundido deja ver el escritorio de Windows.
- La pantalla negra se aplica de inmediato. Los fundidos respetan la preferencia de movimiento reducido de Windows.

## 0.9.1

- Configuración por pestañas, temas claro/oscuro/sistema y tamaños de interfaz persistentes.
- Selects con el diseño de LUMEN, navegación por teclado y menús adaptados al tema.
- Guía de ayuda integrada y créditos con enlaces a los perfiles de los desarrolladores.
- Opción para iniciar LUMEN minimizado con Windows, conservando la biblioteca y sin abrir la proyección.
- La casilla de inicio automático refleja los cambios del motor sin salir de Configuración.
- Publicación de un instalador Tauri firmado y del manifiesto de actualización para Windows x64.
- Las instalaciones Tauri 0.9.0 pueden actualizarse desde la aplicación; las versiones Electron 0.8.x requieren instalar manualmente esta versión.

## 0.9.0

- Migración del escritorio a Tauri 2 y Rust, con WebView2 en Windows y la interfaz de Biblia e himnario existente.
- Backend nativo para SQLite, importaciones, multimedia con FFmpeg/FFprobe, proyección independiente y control remoto local.
- Instalador NSIS de Windows x64 y actualizaciones Tauri con `latest.json` y firmas verificadas mediante la clave pública de LUMEN.
- La primera instalación Tauri se realiza manualmente desde GitHub Releases; las publicaciones 0.8.x conservan su canal anterior.
- El flujo de CI verifica JavaScript y Rust. Si falta la clave de firma, entrega solo un instalador de revisión y bloquea la publicación automática.
- Se mantienen RV1909/BLL y los catálogos incluidos; Biblias adicionales, videos de himnos y datos personales permanecen locales.

## 0.8.1

- Corrección de la preparación simultánea del mismo himno en Windows: la caché se publica una sola vez y cada solicitud conserva su propia cancelación.
- Primera distribución instalable con actualizaciones desde GitHub, créditos e importación local de carpetas de Biblias, incorporados en 0.8.0.

## 0.8.0

- Actualizaciones desde GitHub Releases: búsqueda opcional al iniciar, descarga manual, progreso y reinicio solicitado por el operador.
- Instalador de Windows NSIS y edición portable. La instalación de actualizaciones requiere cerrar la proyección.
- Créditos: Eliezer Lorenzo — Desarrollo y Diseño; Ezequiel Sierra — Desarrollo.
- Importación de carpetas con Biblias JSON de LUMEN, con preservación de identificadores y omisión de ediciones ya instaladas.
- Publicación del código y las Biblias abiertas RV1909/BLL; las traducciones adicionales y los videos de himnos permanecen locales.

## 0.7.0

- Control remoto local desde el navegador de un teléfono, vinculado por PIN.
- Biblia, himnario, programa, transporte y proyección desde la misma red.

## 0.6.0

- Imagen personalizada de la pantalla base, copia offline, vista previa, ajuste y restauración.

## 0.5.2

- Salida a pantalla completa, sin bordes ni barra de título, en la pantalla designada.
