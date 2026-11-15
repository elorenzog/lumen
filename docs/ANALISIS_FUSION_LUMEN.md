# LUMEN: análisis de BibleShow y del Himnario Adventista

Fecha: 14 de noviembre de 2026. Base de comparación: LUMEN 0.3.0, instalaciones locales y aplicaciones abiertas del usuario.

## Actualización: lectura e importación local verificadas

La investigación posterior logró abrir las ocho bases mediante el mecanismo Access del lector local y su archivo de grupo de trabajo. Se analizó una copia del ejecutable .NET; su cargador restauró las instrucciones de los métodos en un proceso aislado, sin invocar la aplicación ni alterar la instancia abierta. Se localizaron los parámetros de conexión y se consultaron copias de los módulos en modo de lectura. No se publican credenciales ni código descompilado.

**Las ocho versiones ya están instaladas en el perfil de recuperación que usa la ventana abierta de LUMEN.** La importación se realizó con los diálogos nativos de la propia aplicación. Las tres traducciones previas RV1909, BLL y BLM permanecen: hay once en total. Los 613 himnos y el archivo de biblioteca no cambiaron. Se creó una copia de seguridad consistente antes de importar.

| Edición | Filas extraídas | Entradas en LUMEN | Tratamiento explícito |
| --- | ---: | ---: | --- |
| DHH1994 | 35.251 | 30.918 | Vista de 66 libros; 4.326 registros de ocho libros adicionales conservados en el archivo de extracción. Siete referencias duplicadas mantienen ambos textos separados por salto de línea y quedan registradas para revisión. |
| KJV1769 | 31.102 | 31.102 | Se conserva la importación previa, sin duplicarla. |
| LBLA1997 | 31.103 | 31.103 | Numeración del módulo conservada. |
| NTV2009 | 31.098 | 31.064 | 34 registros contienen únicamente `<p>`; se conservan en origen y no generan texto de proyección. |
| PDT2012 | 31.081 | 31.081 | Numeración del módulo conservada. |
| RVA2015 | 31.106 | 31.102 | Cuatro registros contienen únicamente `<p>`, con el mismo tratamiento. |
| RVR1960 | 31.104 | 31.104 | Se conserva la identidad del módulo, sin sustituirlo por RV1909. |
| TLA2003 | 26.654 | 26.654 | Se preservan sus referencias tal como están; no se inventan rangos para cubrir huecos de numeración. |

Se conciliaron independientemente 248.499 registros extraídos con 244.128 entradas convertidas: cero diferencias fuera de las transformaciones declaradas. Después se compararon las 244.128 entradas con SQLite, sin diferencias. `PRAGMA integrity_check` devuelve `ok`; los hashes de los ocho `.bib` y del `.mdw` originales siguen iguales. Pasaron el chequeo de tipos y 49 pruebas en once archivos.

Archivos compatibles: `imports/*-lumen.json`. Extracción completa de las tablas Bible, Structure e Info, con marcas, Sync e IDs originales: `imports/bibleshow-source/*-raw.json`. Conciliaciones: `*-conversion.json` y `conversion-summary.json` en esa misma carpeta. Verificación de la instalación: `test-results/bibleshow-interop/installed-verification.json`. Copia previa: `recovery-profile/backups/before-bibleshow-20261114`.

Límites de esta integración: LUMEN 0.3 proyecta 66 libros y texto plano; no reproduce las marcas de cursiva/palabras de Cristo, notas externas ni mapas Sync. La extracción completa y los originales preservan los datos; los ocho libros adicionales de DHH aún no son navegables en la interfaz. Esto resuelve el acceso técnico local; no acredita permisos de redistribución de las ediciones modernas. Sus metadatos conservan los titulares y dejan esos permisos sin especificar. Los JSON locales no se añadieron al instalador.

El resto del informe describe la auditoría anterior y sus pendientes de paridad. Las afirmaciones históricas de que solo KJV se había importado corresponden a ese momento; esta actualización es el estado vigente.

## Resultado y alcance

La fusión es viable, pero LUMEN 0.3 aún no tiene paridad funcional ni las ocho traducciones de BibleShow. El desarrollo debe preservar datos, numeraciones, audio, controles del operador y condiciones de cada traducción. Una interfaz moderna no sustituye esas comprobaciones.

Se revisaron los archivos de las dos instalaciones, la interfaz accesible de BibleShow, las pantallas reales del himnario, su base SQL Server mediante consultas SELECT y los 613 contenedores MKV mediante FFprobe. Se contrastaron funciones con el código actual de LUMEN y con documentación oficial. No se descompilaron los ejecutables ni se desbloquearon los módulos bíblicos.

Las carpetas facilitadas contienen ejecutables, bibliotecas y datos; no se encontraron proyectos `.sln`, `.csproj`, archivos `.cs` ni repositorios Git dentro de ellas. Esta revisión corresponde a las instalaciones y a su comportamiento observable, no a un supuesto código fuente de ambos productos.

Las comprobaciones no reprodujeron un culto completo, no enviaron contenido al proyector ni probaron NDI. FFprobe confirma estructura y pistas de los medios; no equivale a decodificar todos sus fotogramas ni a escucharlos completos. Las funciones no ejecutadas se distinguen de los datos inspeccionados.

## Biblias instaladas y posibilidad de conservarlas

Los ocho archivos `.bib` tienen cabecera `Standard Jet DB`: son bases Microsoft Access/Jet, no JSON, USFM ni archivos `.pack`. Sus `.ldb` son archivos auxiliares de bloqueo, no traducciones adicionales. BibleShow describe la protección de sus módulos mediante seguridad de Access [1]. Una prueba posterior de lectura normal corrigió la generalización inicial: **KJV1769.bib sí es legible sin contraseña**, declara `Protected=0` y `Copyright=Public Domain`; los otros siete rechazaron la apertura por permisos. Se probaron copias, conservando los originales.

| Archivo encontrado | Traducción identificada por BibleShow | Situación para LUMEN |
| --- | --- | --- |
| DHH1994.bib | Dios Habla Hoy, 1994 | Edición instalada; falta una fuente autorizada y verificar permisos para integrarla completa y sin conexión. |
| KJV1769.bib | King James Version, 1769 | Lectura normal sin contraseña comprobada. Convertida e importada en LUMEN: 66 libros, 1.189 capítulos y 31.102 versículos. |
| LBLA1997.bib | La Biblia de las Américas, 1997 | Fuente/licencia de aplicación pendiente; las condiciones para citar no son una entrega del texto completo. |
| NTV2009.bib | Nueva Traducción Viviente, identificada como 2009 en esta instalación | Selección comprobada en la aplicación. Fuente/licencia pendiente; conservar la identidad de edición, sin renombrarla como otra revisión. |
| PDT2012.bib | La Palabra de Dios para Todos, 2012 | Fuente autorizada y condiciones de almacenamiento/distribución pendientes. |
| RVA2015.bib | Reina Valera Actualizada, 2015 | Fuente autorizada y condiciones de almacenamiento/distribución pendientes. |
| RVR1960.bib | Reina-Valera, 1960 | Fuente/licencia de aplicación pendiente. No confundir con la RV1909 que LUMEN ya incluye. |
| TLA2003.bib | Traducción en Lenguaje Actual, 2003 | Fuente autorizada y condiciones de almacenamiento/distribución pendientes. |

Se comprobó la existencia de los ocho módulos y sus selectores. Durante la navegación se verificaron los encabezados activos de LBLA y NTV y se restauró RVR, manteniendo la salida oculta. Después se convirtió KJV mediante Access/OLE DB en modo de lectura y se importó usando el diálogo real de LUMEN. Se conciliaron sus 31.102 referencias y textos con la base SQLite de LUMEN, sin diferencias respecto de la conversión. No se importaron las otras siete. El intento de enumerar automáticamente sus páginas de información por accesibilidad no fue concluyente; no se usa como prueba de permisos.

KJV 1769 también está disponible en eBible como texto estandarizado de 1769; esa fuente señala dominio público fuera del Reino Unido y explica los derechos territoriales británicos [5]. Ese recurso web incluye apócrifos, pero **no se usó para esta importación**: el módulo local leído declara `Apocrypha=0` y contiene 66 libros. Las marcas de cursiva y palabras de Cristo se retiraron del texto de proyección, conservando todas las palabras; el original mantiene las marcas y el aviso de procedencia de LUMEN explica esta limitación visual.

Las políticas consultadas de RVR1960, NTV y LBLA permiten ciertos usos de citas bajo condiciones y contemplan autorizaciones para otros usos [3,4,6]. No se ha localizado un acuerdo transferible que autorice a LUMEN a empaquetar las siete ediciones modernas completas. La instalación de BibleShow no demuestra ese permiso para una aplicación distinta. Tampoco debe asumirse que cualquier API ofrece almacenamiento offline permanente de todas estas ediciones.

**Decisión de migración:** registrar las ocho ediciones como objetivos de compatibilidad. Una edición solo se marcará «disponible en LUMEN» cuando tenga texto de procedencia autorizada, derechos documentados y validación de integridad. RV1909 y BLL no son sustitutos silenciosos de RVR1960, DHH, NTV u otras. Mientras falten versiones necesarias, BibleShow debe seguir disponible durante la transición.

## Qué hace BibleShow y qué falta en LUMEN

La interfaz separa referencia, navegación, control, monitor, opciones, programa, búsqueda, historial y reproducción automática. La navegación y la salida son estados distintos: el operador puede preparar una referencia sin sustituir lo que ve la congregación. Ese principio debe mantenerse.

| Función | Evidencia de BibleShow | LUMEN 0.3 / trabajo necesario |
| --- | --- | --- |
| Versión → libro → capítulo → versículo | Controles Reference y cuadrícula Browser | Existe selección por botones; conservarla y mejorar abreviaturas y teclado. |
| Referencias abreviadas y entrada directa | F5/F9 y campo Reference | Parcial: LUMEN exige espacio entre libro y capítulo; ampliar formatos como `mt6.9`. |
| Rangos de versículos | Reference/AutoPlay y controles de rango | Parcial: LUMEN limita cada diapositiva a seis entradas; falta paginar pasajes largos automáticamente. |
| Lectura de capítulo / versos adyacentes | Browser, Books/Chapters/Verses | Existe lectura del capítulo; mantener contexto al buscar. |
| Búsqueda por palabra o frase | Search Text | Existe búsqueda básica local. |
| Rango de libros, palabra completa, acentos y comodines | Controles SrcRange/Sensitive/Whole/Wildcards | Pendiente como opciones explícitas; no confundir normalización actual con todas estas funciones. |
| Versiones paralelas | Casillas de versiones y opciones de pantalla | Parcial: LUMEN compara dos; BibleShow admite cuatro en la salida principal y otras combinaciones entre salidas [2]. |
| Correspondencia entre numeraciones bíblicas | Módulos y configuración | Parcial: LUMEN maneja puentes numéricos; faltan mapas de versificación entre ediciones. |
| Palabras de Cristo y formatos semánticos | Configuración del texto | Pendiente: modelo de texto enriquecido y reglas por edición. |
| Avisos de derechos y procedencia | Información de versión y salida | Parcial: LUMEN guarda procedencia; falta un aviso de copyright en salida configurable por licencia. |
| Vista previa y monitor en vivo | CtlPreview/Monitor | Existe separación de previa y vivo. |
| Mostrar, ocultar, congelar/descongelar | Show/Hide y estado de control | Mostrar/ocultar existe; congelar explícitamente en modo automático y su indicador son pendientes. |
| Varias pantallas con configuración independiente | Opciones de displays | Parcial: LUMEN elige un monitor y abre una salida; no cuatro salidas simultáneas. |
| Tamaño, posición y fuente de cada salida | Configuración Display | Parcial: falta geometría independiente y monitor de escenario. |
| NDI y fuentes NDI | Controles/documentación oficial | Pendiente; no probado en la instalación. |
| Datos XML, imagen PNG y captura del versículo | Output y Save as | Pendiente. Existen plantillas de integración con otras aplicaciones [2]. |
| Programa ordenado | Program: Add, Load, Save, subir/bajar | LUMEN tiene un programa mixto; faltan listas con nombre, importación/exportación y navegación secuencial. |
| Historial | History | Parcial: LUMEN conserva las últimas 30 entradas, no un historial completo configurable. |
| AutoPlay: duración, bucle, aleatorio | Panel AutoPlay capturado | Pendiente. La carpeta AutoPlay local no contiene listas de ejemplo. |
| Transiciones y líneas de progreso | Controles AutoPlay/Transition | Pendiente. No se han probado los efectos mediante proyección. |
| Perfiles, paneles y modo nocturno | Preferencias e instancias | Pendiente: perfiles de operador, densidad y distribución adaptable. |

### Fondos y temas

Hay **44 temas `.thm`**: 22 de imagen, 10 de vídeo, 8 de color y 4 animaciones. Hay **22 archivos de fondo**: 21 imágenes y un WMV reutilizado por varios temas. Un tema no equivale a un archivo de fondo.

Los `.thm` son configuración INI, varios con codificación UTF-16LE. Definen cajas independientes para referencia y versículo, fuentes, inclinación, colores con alfa, contornos, sombra, brillo y efectos. `LowerThird01_01` coloca el texto en una franja inferior; eso no se reproduce únicamente cambiando la alineación vertical de una caja centrada.

| Aspecto | Estado de LUMEN |
| --- | --- |
| Color, degradado, imagen y vídeo silencioso | Disponible, con ajustes básicos y vista previa de borrador. |
| Temas guardados | Disponible; falta una galería de miniaturas y adaptación de `.thm`. |
| Fuentes y estilo | Parcial: tres familias, tamaño y negrita; falta estilo independiente de referencia, cursiva y más controles. |
| Distribución | Parcial: alineación, posición vertical y márgenes; faltan dos cajas redimensionables y lower thirds. |
| Efectos | Parcial: sombra, contorno y oscurecimiento; faltan brillo/glow, corrección de color y otros efectos del original. |
| WMV, transparencia y fondo NDI | Pendientes. LUMEN importa MP4/WebM; el WMV local necesitaría adaptación. |
| Importación de temas/activos | Pendiente de adaptador y de comprobar condiciones de reutilización de cada activo. |

Los temas personalizados **Aventurero**, **conquistadores 75** y **Nehemias** apuntan a imágenes no encontradas dentro de las carpetas revisadas. No se concluye que hayan desaparecido de todo el PC: el asistente de migración deberá pedir localizar esos archivos. Los otros 29 temas con imagen/vídeo sí tienen su archivo asociado en `Backgrounds/Pictures` o `Backgrounds/Video`.

## Qué contiene realmente el Himnario Adventista

La instalación usa .NET/WinForms, controles DotNetBar, Windows Media Player y SQL Server LocalDB. La conexión configurada utiliza autenticación integrada. Se consultó la base ya abierta; no se adjuntó otra copia ni se ejecutaron INSERT/UPDATE/DELETE.

| Recurso | Resultado comprobado |
| --- | --- |
| Catálogo `himnario` | 613 registros. |
| Vídeos | 613 MKV, 6.490.180.227 bytes en total. |
| Estructura de medios | 613/613 examinados sin error por FFprobe; todos tienen vídeo H.264 y dos audios: AAC y MP3. |
| Letras | Los 613 registros tienen texto, 317.449 caracteres en conjunto. No se copian letras al informe. |
| Referencias bíblicas | Los 613 registros tienen un campo de referencia no vacío; su exactitud no se ha cotejado versículo por versículo. |
| Índice | 9 categorías y 46 temas. |
| Autores | Tabla de 740 entradas; relaciones distintas para letra, música, versión española y arreglo. Cinco himnos carecen de al menos uno de los dos enlaces letra/música. |
| Numeración antigua | 367 registros con número positivo, 366 números antiguos distintos; otros 246 contienen `sn`. |
| Preferencias de catálogo | 19 registros con `estado='*'` y 366 con `[like]=1`; son dos campos diferentes. Su correspondencia exacta con los iconos debe confirmarse antes de migrarlos como favoritos o gustos. |
| Listas guardadas | Tablas `listaReproduccion` y `detalleListaReproduccion` presentes, ambas con cero filas en la consulta. |

Las nueve categorías son: El Culto; Dios el Padre; Jesucristo; El Espíritu Santo; La Sagradas Escrituras; El Evangelio; La Vida Cristiana; La Iglesia; El Hogar Cristiano. Se conserva la escritura original de los datos, incluso cuando convenga revisarla posteriormente.

### La numeración de 1962 requiere un modelo diferente

Ejemplo observado: «Unidos en espíritu» es **003 en 2009 y 011 en la numeración antigua**. «Alabanzas sin cesar» es 004/022. Un mismo registro contiene ambas referencias; no deben crearse dos himnos independientes solo para poder filtrarlos.

Existe una colisión del número antiguo **190** entre los nuevos **193** y **293**. Se debe presentar para revisión, preservando ambos registros. No se debe deduplicar por número antiguo ni corregir la equivalencia por conjetura. Estos datos no constituyen un catálogo completo de todos los himnos de 1962.

El esquema actual de LUMEN tiene un único `number` y un único `edition`. Ese filtro **no conserva** esta relación. La migración necesita un identificador estable, número 2009, número 1962 opcional, procedencia y un estado de correspondencia revisada. El vídeo se vincula al himno, no al número mostrado.

### Audio, reproducción y búsqueda

La primera pista de audio de los archivos inspeccionados aparece como AAC/cantado y la segunda como MP3/instrumental. Las etiquetas contienen cuatro excepciones:

| Archivo / número 2009 | Etiqueta a revisar |
| --- | --- |
| 048 | `Inatrumental` en la segunda pista. |
| 414 | `Cantidad` en la primera. |
| 443 | `Canado` en la primera. |
| 526 | `Canado` en la primera. |

La etiqueta de idioma `eng` en pistas instrumentales no demuestra que se cante en inglés. Se debe usar la estructura y una asignación confirmada, conservar las etiquetas originales y permitir ajustes por himno. Ninguna pista se escuchó íntegramente durante el inventario.

La aplicación muestra búsqueda avanzada por contenido del himno, referencia bíblica, texto de versículo y letra/música. La base permite esas relaciones: no es necesario intentar OCR del vídeo para reconstruir el catálogo. El índice visual permite navegar por contenido/tema.

Los ajustes observados incluyen carpeta de medios, alineación, monitor, dimensiones del reproductor, tema de interfaz, elección de reproductor y una opción para mantener un solo reproductor en pantalla extendida. No se cambió ni guardó ninguno de esos valores. La alternativa al reproductor WMP se observó como opción visual, sin verificar su implementación o nombre exacto.

| Función del himnario | Estado de LUMEN / requisito |
| --- | --- |
| Número y título desde MKV | Disponible; no reemplaza la importación del catálogo SQL. |
| Correspondencias 1962/2009 | Pendiente: modelo de doble numeración. |
| Letras y datos ya existentes | LUMEN permite introducirlos; falta importarlos con validación y procedencia. |
| Categorías y temas | Búsqueda textual parcial; falta el índice jerárquico de 9/46. |
| Autoría completa | Dos campos en LUMEN; faltan versión española y arreglo como relaciones separadas. |
| Búsqueda por texto bíblico relacionado | Pendiente: guardar/indexar el texto relacionado o resolverlo desde una fuente autorizada. |
| Favoritos/gustos | Un favorito en LUMEN; no fusionar los dos campos originales sin confirmar semántica. |
| Cantado/instrumental | Reproducción disponible; falta asignación fiable en el importador del catálogo existente. |
| Varias listas guardadas | Pendiente; el programa único actual no equivale a varias listas. |
| Reproductor y geometría | Motor nativo disponible; faltan alternativas externas y algunas preferencias del original. |

## Diseño de la fusión

Mantener el lenguaje visual de LUMEN: controles claros, paneles de preparación y salida separados, texto legible y funcionamiento local. La modernización debe reducir pasos sin ocultar controles importantes.

1. Biblioteca con pestañas Biblia/Himnario, selector rápido visible y búsqueda unificada con filtros de ámbito.
2. En el himnario, cambiar la edición modifica la numeración de búsqueda y presentación; la ficha conserva ambas equivalencias.
3. Un programa de culto mixto con varias listas guardadas, orden, modo de audio y transición por elemento.
4. Controles permanentes de salida: preparar, proyectar, congelar, pantalla negra y fondo solo, con estados inequívocos.
5. Galería de temas con miniaturas; editor de dos cajas independientes para texto/referencia, safe areas y lower thirds.
6. Salidas configurables por monitor, con futura salida de escenario, datos y NDI. No mezclar su configuración con la del operador.
7. Asistente de migración: resumen de lo detectado, permisos de traducciones, recursos ausentes, conflictos y copia de seguridad antes de aplicar.

La arquitectura debe separar catálogo bíblico, catálogo de himnos, medios, listas y motor de presentación. Los adaptadores de migración deben leer los originales y escribir en el almacén de LUMEN; no convertir la base original en el almacenamiento activo de la nueva aplicación.

## Orden de implementación y criterios de aceptación

| Prioridad | Trabajo | Condición para considerarlo terminado |
| --- | --- | --- |
| P0 | Respaldo y recuperación de datos | Conservar una última copia válida y recuperar de forma controlada. La biblioteca original dañada detectada al iniciar LUMEN sigue intacta; la causa del daño no está establecida. |
| P0 | Importador de catálogo y doble numeración | Conciliar 613 registros con 613 archivos, conservar letras/autorías/referencias, mostrar 246 `sn` y resolver la colisión 190 sin descartar datos. |
| P0 | Modos de audio | Cada archivo tiene dos asignaciones confirmadas, originales intactos y cambio de pista probado con los MKV reales. |
| P0 | Traducciones requeridas | Cada una de las ocho tiene identidad, fuente, permisos e integridad validados; no se declara paridad antes de ello. |
| P1 | Índice, búsqueda y listas | Índice 9/46, todos los ámbitos de búsqueda y varias listas mixtas persistentes, importación/exportación y reproducción secuencial. |
| P1 | Editor y migración de temas | Dos cajas independientes, lower thirds, recursos ausentes visibles y tratamiento explícito de WMV/efectos no compatibles. |
| P1 | Control y multisalida | Freeze, fondo solo, paginación, transiciones y varias salidas, con atajos y estado persistente coherentes. |
| P2 | Integraciones avanzadas | NDI, XML/PNG y perfiles, probados contra los equipos y programas usados por la iglesia. Siguen siendo parte del objetivo de paridad. |

Pruebas de aceptación imprescindibles: recorrer ambos catálogos de numeración; buscar por título/letra/tema/referencia/autor; reproducir cantado e instrumental; cambiar Biblia manteniendo referencia; comparar traducciones; congelar mientras se prepara otra selección; recuperar el programa tras reinicio; simular un guardado interrumpido; desconectar/reconectar el proyector; comprobar los avisos de derechos. Antes de retirar los originales se requiere una prueba de culto completa en el equipo de la iglesia.

## Evidencias y fuentes

Evidencias locales en `test-results/legacy-analysis`: `hymnal-schema.json`, `hymnal-catalog.json` (metadatos, sin letras completas), `hymnal-media.json`, `bibleshow-themes.json`, controles accesibles y capturas de navegación/configuración. Los scripts `inspect-legacy.ps1` y `audit-legacy-media.mjs` reproducen los inventarios. Las capturas son evidencia interna y no se distribuyen con este informe.

Se instaló únicamente KJV1769 en el perfil de recuperación de LUMEN que está abierto; los otros siete módulos no se importaron. No se cambió el modelo de datos de la aplicación. Los originales se conservan; BibleShow se devolvió a RVR. El archivo compatible está en `imports/KJV1769-lumen.json`; el cotejo completo está en `test-results/legacy-access-probe/kjv-import-verification.json`.

1. BibleShow, presentación y condiciones: https://bibleshow.net/presentation.php
2. BibleShow, operación: https://bibleshow.net/operation.php
3. American Bible Society, permisos RVR1960: https://bibles.com/pages/american-bible-society-rights-and-permissions
4. Tyndale Español, permisos NTV: https://www.tyndaleespanol.com/permisos
5. eBible, KJV estandarizada de 1769: https://ebible.org/eng-kjv/copyright.htm
6. Lockman, permisos LBLA: https://www.lockman.org/permission-to-quote-copyright-trademark-information/

Los enlaces se revisaron el 14 de noviembre de 2026. Las condiciones pueden cambiar; la integración deberá conservar la evidencia aplicable a cada licencia.
