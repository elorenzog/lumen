# Verificación de LUMEN 0.1.0

Fecha local: 13 de noviembre de 2026 (America/Santo_Domingo).

## Resultado

- TypeScript estricto y compilación de producción: PASS.
- Vitest: 19 pruebas, 3 archivos, PASS.
- Prueba integral real de Electron desde el código: PASS.
- Prueba integral de `release/win-unpacked/LUMEN.exe`: PASS. Esta ejecución utilizó los FFmpeg y FFprobe incluidos en el paquete.
- Portable generado: `release/LUMEN-0.1.0-win-x64.exe` (266,711,982 bytes).
- Nueve capturas de interfaz en `test-results/`: Biblia en 1500/768/375, programa, himnario vacío/importado/en reproducción, ajustes, salida de proyección.
- Dos revisiones independientes de las capturas: PASS. Se corrigieron el crecimiento de la biblioteca en tablet, el foco tras seleccionar, el contraste secundario y las acciones sin himno seleccionado.
- Revisiones independientes de objetivo, calidad, seguridad y contexto: PASS. La revisión independiente de ejecución quedó INCONCLUSA: en su entorno aislado pasaron 16 pruebas y las 3 de HTTP local recibieron EACCES por restricciones de loopback. En el entorno nativo, el ejecutor principal verificó las 19 pruebas y el E2E completo tanto desde código como desde el ejecutable empaquetado, con PASS. No se presenta la revisión independiente como una aprobación total.

No había repositorio Git al iniciar el proyecto; esta evidencia corresponde al árbol local y a los artefactos construidos, no a un commit.

## Escenarios ejecutados

La prueba abre una instancia con datos aislados, busca Juan 3:16, abre una salida nativa, comprueba texto proyectado y blackout, activa selección automática y proyecta Juan 3:17. Añade un elemento al programa. Genera e importa un MKV de doce segundos con dos pistas AAC distintas, reproduce el vídeo H.264, cambia el audio manteniendo el tiempo, oculta y pausa la salida, restaura, espera el fin del himno y vuelve a reproducirlo desde el inicio. Verifica pausa y ausencia de errores del renderer. Reinicia y comprueba programa, biblioteca y ajustes. Importa una Biblia con marcado en la abreviatura y comprueba que se muestra como texto. Comprueba además que no hay desbordamiento horizontal en 375/768 píxeles y que la biblioteca de tablet conserva su alto limitado.

Las pruebas unitarias/integración cubren nombres de MKV, referencias y rangos, búsqueda sin tildes, reloj de reproducción, importación XML, rechazo de entidades y texto anidado, integridad de los 66 libros y servicio HTTP local con rangos y token obligatorio.

## Límites comprobables

Solo se ejecutó Windows. No se probó físicamente la colocación en un segundo monitor ni el equipo de sonido/proyector de la iglesia. No se compilaron ni ejecutaron DMG/AppImage en macOS/Linux. El archivo MKV de prueba es generado; aún debe validarse un himno real del usuario. Los módulos BibleCast `.pack` son incompatibles con esta versión y no se distribuyen.

## Reproducir

```sh
pnpm test
pnpm build
pnpm test:e2e
```

Para probar una compilación empaquetada, establece `LUMEN_E2E_EXECUTABLE` con la ruta absoluta de su ejecutable y ejecuta `pnpm test:e2e`.

SHA-256 del portable: FD92E040F12257A06441834CDD0046367FC17D7F56B672E888BF9292B0460D07.

