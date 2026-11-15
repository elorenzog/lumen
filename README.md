# LUMEN 0.8

**Biblia e Himnario Adventista** · La Palabra que ilumina, la alabanza que inspira.

Aplicación de escritorio en español para preparar pasajes, himnos y el programa del culto. La proyección ocupa la pantalla designada sin bordes ni barra de título, mientras el operador conserva su ventana. La Biblia, búsqueda y reproducción funcionan sin Internet.

## Descargar e instalar

Abre [las publicaciones de LUMEN](https://github.com/elorenzog/lumen/releases/latest).

- **LUMEN-Setup**: instalador de Windows, selección de carpeta, accesos directos y actualizaciones dentro de la aplicación.
- **LUMEN-Portable**: ejecución sin instalar; se reemplaza manualmente para actualizar.
- **SHA256SUMS.txt**: sumas de verificación de los archivos publicados.

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

El flujo de publicaciones está inspirado en [Cantoral](https://github.com/xlCyanz/cantoral), adaptado a Electron y NSIS. [Cómo publicar una versión](docs/ACTUALIZACIONES_Y_PUBLICACION.md).

## Atajos

| Acción | Atajo |
| --- | --- |
| Referencia rápida | Ctrl + L |
| Versículo anterior / siguiente | Flechas izquierda / derecha, fuera de un campo de edición |
| Proyectar selección | Ctrl + Enter |
| Pantalla negra / restaurar | B, fuera de un campo de edición |
| Cerrar proyección | Esc en la ventana de salida |

## Desarrollo y verificación

Requisitos: Node.js 26 y pnpm 10.32.1. El instalador/portable incluye su motor.

```sh
pnpm install --frozen-lockfile
pnpm exec tsc --noEmit
pnpm test
pnpm build
pnpm start
```

Para recarga de desarrollo usa `pnpm dev`. Para instalar Windows ejecuta `pnpm build` y `pnpm dist:win`. Publicar una etiqueta `v` seguida de la versión dispara comprobaciones, empaquetado y GitHub Release.

Después de compilar, `node scripts/e2e.mjs` y `node scripts/e2e-remote.mjs` comprueban flujos nativos con datos aislados. La pantalla física y los teléfonos reales deben verificarse en el equipo de destino. macOS/Linux requieren compilación y pruebas en sus sistemas.

Electron, TypeScript estricto, Vite, SQLite, Zod, Lucide y FFmpeg/FFprobe. [Avisos de terceros](THIRD_PARTY_NOTICES.md). No se incluyen NDI ni Chromecast.
