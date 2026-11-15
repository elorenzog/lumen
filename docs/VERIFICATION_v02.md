# Verificación de LUMEN 0.2

Fecha local: 14 de noviembre de 2026 (America/Santo_Domingo).

## Evidencia

- Compilación TypeScript estricta y producción: PASS.
- Vitest: 37 pruebas en 8 archivos, PASS. Incluye SQLite/FTS5, búsquedas, importación, USFM, rangos de versículos, fusión de himnos con cambios simultáneos, etiquetas de comparación y cancelaciones de reproducción.
- Prueba integral de Electron desde código: PASS. Comprueba además que no aparece un aviso de error durante los cambios de audio y la reproducción normal.
- Prueba integral de la compilación Windows empaquetada: PASS tras generar el portable final; resultado en `test-results/result.json` y registro de empaquetado en `test-results/package-v02.log`.
- Importación real de RV1909 desde el ZIP USFM publicado por eBible: 66 libros y 31,084 entradas, PASS.
- Descarga real de BLL desde fetch.bible: 66 libros y 31,095 entradas, PASS. La fuente declara dominio público y estado de borrador; ambos avisos se conservan.

## Prueba de uso

La prueba abre una instancia de datos aislados, busca y proyecta un pasaje, compara RV1909/BLL y proyecta las dos ediciones con sus referencias. Usa la cuadrícula de libros, el selector de versículos y el historial. Genera un MKV real de dos audios, lo importa, guarda favoritos, edición, letra y asignación cantado/instrumental, busca por letra, reproduce, cambia de audio, oculta/restaura la pantalla, pausa y repite un himno terminado. Reinicia para verificar persistencia. Importa JSON y ZIP USFM, verifica texto sin notas editoriales y caracteres HTML escapados. Comprueba anchos 375/768/1500 y acceso a los controles de importación móvil.

Se guardan 14 capturas de las pantallas y estados probados. Las revisiones visuales identificaron y permitieron corregir el corte de la biblioteca móvil, los nombres accesibles del historial y un aviso falso de cancelación del vídeo de la vista previa.

## Correcciones finales

1. USFM conserva la separación que sigue al cierre de una nota, excluyendo el contenido editorial.
2. La importación de himnos fusiona resultados con la biblioteca más reciente. No revierte favoritos, letras o ediciones modificadas durante el análisis ni restaura himnos eliminados.
3. La comparación proyectada incluye las referencias reales de cada traducción, incluso cuando una edición usa un rango combinado.
4. Las cancelaciones de reproducción de un vídeo ya retirado no generan avisos falsos ni pueden detener una proyección más reciente. Los fallos reales del vídeo activo siguen notificándose.
5. La guía de fuentes se incluye en el paquete junto al README y los avisos de terceros.

## Límites

Windows fue el sistema ejecutado. No se probó el proyector físico ni los MKV reales de la iglesia. macOS/Linux no se compilaron ni probaron aquí. API.Bible, el formato de AO Lab y los datos de estudio de STEPBible siguen sin adaptador activo. No se usa ni descifra `.pack`. No se configura firma de código; el paquete conserva el icono predeterminado de Electron.

No había repositorio Git al comenzar; esta evidencia corresponde al árbol local y al ejecutable generado.

Dos revisiones independientes finales de las 14 capturas y de la corrección de reproducción: PASS, sin bloqueos.

SHA-256 del portable final: 6F058EDA973BD217437DB762BC81300153DC1BFFC7936BB256764EA9270426C7

