# LUMEN 0.3 — Verificación

Fecha: 14 de noviembre de 2026. Entorno: Windows x64, Electron real.

- TypeScript estricto: PASS.
- Vitest: 43 pruebas en 10 archivos, PASS. Incluye migración de ajustes 0.2, validación de apariencia y rangos con puentes USFM.
- Electron / Playwright: PASS, sin errores en ambos renderizadores. La prueba completa conserva Biblia, búsquedas, comparación, programa, historial, importación USFM, MKV con dos audios, cambio de pista, pantalla negra y persistencia.
- Selección: cuadrícula predeterminada de libros, botones de capítulo/versículo, Salmos 119:176, modo manual/automático, Mayús, rango escrito y Ctrl+L. Doble clic manual probado tras corregir la sustitución del botón al renderizar.
- Apariencia: borrador aislado, Cancelar/Aplicar, degradado, fuente/negrita, alineación, posición inferior, contorno/sombra/márgenes. Ajuste de textos largos verificado mediante límites reales del texto y captura.
- Fondos locales: imagen importada y vídeo MP4 con audio de origen. Ambos siguen funcionando después de eliminar los originales; el vídeo de fondo se mantiene silenciado y se pausa/reanuda con pantalla negra. Imagen y temas recuperados al reiniciar.
- Siete capturas nuevas: selector a 1500/1280px, editor a 1500/768/375px, proyección de degradado y vídeo. Vistas existentes también capturadas por la prueba completa.

Evidencia reproducible: `node node_modules/typescript/bin/tsc --noEmit`, `node node_modules/vitest/vitest.mjs run`, `node scripts/build.mjs`, `node scripts/e2e.mjs`. En este entorno la automatización de Electron debe lanzarse desde el proceso nativo de Git Bash. `test-results/result.json` y `customization-result.json` contienen los resultados; las capturas `v03-*.png` muestran los siete estados nuevos.

Revisión independiente: objetivos/diseño A, ejecución/visual B, seguridad y contexto aprobados. La primera revisión de calidad encontró el doble clic manual; se corrigió. Una revisión nueva ejecutó otra prueba completa y aprobó calidad, gesto corregido y los siete estados visuales regenerados. La segunda revisión visual independiente también aprobó el código actual. Cinco áreas aprobadas, sin bloqueos.

| Área | Resultado | Evidencia |
| --- | --- | --- |
| Objetivos y diseño A | PASS | v03_visual_a y v03_final_gesture_a |
| Ejecución y visual B | PASS | v03_qa_visual_b y v03_final_visual_b |
| Calidad | PASS tras corrección | v03_final_gesture_a, nueva ejecución Electron |
| Seguridad | PASS | v03_security, sin hallazgos críticos/altos |
| Contexto | PASS | v03_context, referencias de versión corregidas |

Paquete final Windows x64: `release/LUMEN-0.3.0-win-x64.exe`, 268503612 bytes. SHA-256: `671214D5861CCFF8B11CCCCD6601E00C03232258BA2A1E03A7D2398B4A4C153B`. La prueba completa también pasó usando `release/win-unpacked/LUMEN.exe` como ejecutable: incluye imagen/vídeo importado, reinicio, temas guardados y audio MKV. La portable se abre al terminar para uso del operador. El archivo `test-results/v03-artifact.json` identifica las fuentes revisadas y el paquete sin depender de un repositorio Git.

Límites: sin prueba del proyector físico de la iglesia ni de sus MKV reales. No se han probado paquetes macOS/Linux. No se incluye NDI ni transparencia del escritorio. El ejecutable Windows usa el icono predeterminado y no está firmado. El límite de megapíxeles se comprueba después de decodificar la imagen; FFprobe valida el códec del vídeo y usa el motor multimedia existente.
