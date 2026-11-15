# Traducciones y funcionamiento sin conexión

LUMEN 0.3 almacena traducciones en `translations.sqlite`, en los datos de la aplicación. Contiene tablas de traducciones, libros, capítulos y versículos, con claves únicas, transacciones y búsqueda de texto FTS5. No necesita un servidor ni Internet durante la lectura/proyección.

## Ediciones iniciales

| Edición | Entradas de texto | Fuente | Permiso |
| --- | ---: | --- | --- |
| Reina-Valera 1909 | 31,084 | [eBible.org](https://ebible.org/find/details.php?id=spaRV1909) | Dominio público |
| Santa Biblia libre Latinoamericano (BLL) | 31,095 | [eBible.org](https://ebible.org/Scriptures/details.php?id=spabll), distribuida por [fetch.bible](https://fetch.bible/access/manual/) | Dominio público; la fuente la identifica como borrador en revisión |

Las casillas sin texto de la distribución original de RV1909 no se inventan ni se renumeran. Las traducciones pueden usar otra versificación; la comparación muestra las referencias y avisa de esta diferencia.

## Importación

- LUMEN JSON: mantiene nombre, abreviatura, licencia, fuente y procedencia cuando se incluyen en el archivo.
- Scrollmapper JSON: 66 libros en orden canónico.
- Zefania XML: versículos de texto plano. Las entidades/DOCTYPE y el formato anidado no admitido se rechazan.
- USFM: un archivo, varios libros de una misma edición o un ZIP con archivos `.usfm`/`.sfm`. Se reconocen los 66 códigos canónicos. Se conservan palabras y rangos; se excluyen notas editoriales, referencias cruzadas y atributos léxicos del texto destinado a proyección. Un rango `17-18` sigue siendo una sola entrada original.

Un paquete USFM oficial de RV1909 de eBible se importó completo: 66 libros, 31,084 entradas. Los ZIP se leen en memoria sin extraer rutas al disco, con límites de tamaño y número de entradas.

La importación no concede derechos nuevos: las ediciones locales sin metadatos muestran «consultar la autorización». No se incluyen ni se descifran módulos BibleCast `.pack`.

## Descargas

En Ajustes puede consultarse el catálogo de fetch.bible. Esta versión ofrece BLL y Santa Biblia libre para el mundo únicamente si el manifiesto actual identifica su licencia como dominio público. La licencia se consulta de nuevo antes de descargar. Se descargan los 66 libros y solo entonces se instala la traducción dentro de una transacción. Una interrupción no destruye la edición anterior. Después, lectura, búsqueda y proyección funcionan offline.

La lectura y búsqueda bíblica no consultan Internet. Desde LUMEN 0.8, la consulta opcional de actualizaciones al iniciar solo solicita la versión publicada en GitHub y puede desactivarse en Acerca de LUMEN. Los metadatos guardan proveedor, URL fuente, licencia, atribución, fecha de descarga y permisos declarados para almacenamiento/redistribución.

## Otros proveedores propuestos

| Fuente | Situación en esta versión |
| --- | --- |
| [Open.Bible RV1909](https://open.bible/bibles/reina-valera-1909) | Su página declara dominio público y ofrece USFM; se admiten esos archivos locales. La descarga directa del artefacto devolvió error del servidor durante la validación; se verificó el paquete oficial de eBible. |
| [Free Use Bible API / AO Lab](https://github.com/HelloAOLab/bible-api) | Fuente evaluada; aún no hay adaptador para su JSON de capítulos. No debe confundirse con el JSON LUMEN/Scrollmapper. |
| [API.Bible](https://api.bible/terms-and-conditions) | Sin conexión configurada: requiere cuenta, clave y autorización para las traducciones. Sus términos actuales exigen comprobar/actualizar el contenido almacenado al menos cada 30 días. No es una autorización general de almacenamiento permanente para todas las Biblias. |
| [STEPBible](https://github.com/STEPBible/STEPBible-Data) | Recurso futuro de estudio; no se ha incorporado etiquetado morfológico o léxico. |

No se asume que todo archivo accesible por una API sea de dominio público ni que todas las licencias abiertas tengan los mismos permisos.

## Migración desde LUMEN 0.1

La primera apertura crea la base e importa las Biblias `bible-*.json` anteriores. No borra esos archivos. Himnos y programa conservan sus datos; los nuevos campos reciben valores iniciales sin asignar ediciones ni modos de audio por conjetura. Cierra las versiones anteriores antes de usar 0.3 para evitar que dos versiones escriban simultáneamente la biblioteca.
