use super::{
    models::{Bible, Verse},
    validation,
};
use crate::error::{Error, Result};
use quick_xml::{
    Reader,
    events::{BytesStart, Event},
};

fn xml_error(error: impl std::fmt::Display) -> Error {
    Error::external("xml", error)
}
fn attribute(
    reader: &Reader<&[u8]>,
    element: &BytesStart<'_>,
    name: &[u8],
) -> Result<Option<String>> {
    for item in element.attributes() {
        let item = item.map_err(xml_error)?;
        if item.key.as_ref() == name {
            return Ok(Some(
                item.decode_and_unescape_value(reader.decoder())
                    .map_err(xml_error)?
                    .into_owned(),
            ));
        }
    }
    Ok(None)
}
fn number(reader: &Reader<&[u8]>, element: &BytesStart<'_>, name: &[u8]) -> Result<u32> {
    attribute(reader, element, name)?
        .ok_or_else(|| Error::new("xml", "Falta una referencia XML."))?
        .parse::<u32>()
        .map_err(xml_error)
}
fn entity(value: &str) -> Result<char> {
    match value {
        "amp" => Ok('&'),
        "lt" => Ok('<'),
        "gt" => Ok('>'),
        "quot" => Ok('"'),
        "apos" => Ok('\''),
        numeric => {
            let number = if let Some(hex) = numeric.strip_prefix("#x") {
                u32::from_str_radix(hex, 16).map_err(xml_error)?
            } else if let Some(decimal) = numeric.strip_prefix('#') {
                decimal.parse::<u32>().map_err(xml_error)?
            } else {
                return Err(Error::new(
                    "xml",
                    "El XML contiene una entidad no admitida.",
                ));
            };
            char::from_u32(number)
                .ok_or_else(|| Error::new("xml", "El XML contiene un carácter no válido."))
        }
    }
}
pub fn import_zefania(content: &str, filename: &str, id: &str) -> Result<Bible> {
    if content.contains("<!DOCTYPE") || content.contains("<!ENTITY") {
        return Err(Error::new(
            "xml",
            "El XML contiene declaraciones no admitidas.",
        ));
    }
    let mut reader = Reader::from_str(content);
    let mut stack: Vec<String> = Vec::new();
    let mut book = 0;
    let mut chapter = 0;
    let mut verse_number = None;
    let mut text = String::new();
    let mut root_name = None;
    let mut title = String::new();
    let mut identifier = String::new();
    let mut rights = String::new();
    let mut verses = Vec::new();
    let mut root_seen = false;
    loop {
        match reader.read_event().map_err(xml_error)? {
            Event::Start(element) => {
                let name = std::str::from_utf8(element.name().as_ref())
                    .map_err(xml_error)?
                    .to_owned();
                if verse_number.is_some() {
                    return Err(Error::new(
                        "xml",
                        "El versículo XML contiene formato anidado no admitido.",
                    ));
                }
                if stack.is_empty() && (root_seen || name != "XMLBIBLE") {
                    return Err(Error::new(
                        "xml",
                        "El XML no tiene una única raíz XMLBIBLE.",
                    ));
                }
                match name.as_str() {
                    "XMLBIBLE" if stack.is_empty() && !root_seen => {
                        root_seen = true;
                        root_name = attribute(&reader, &element, b"biblename")?;
                    }
                    "BIBLEBOOK" if stack.last().is_some_and(|parent| parent == "XMLBIBLE") => {
                        book = number(&reader, &element, b"bnumber")?;
                    }
                    "CHAPTER" if stack.last().is_some_and(|parent| parent == "BIBLEBOOK") => {
                        chapter = number(&reader, &element, b"cnumber")?;
                    }
                    "VERS" if stack.last().is_some_and(|parent| parent == "CHAPTER") => {
                        verse_number = Some(number(&reader, &element, b"vnumber")?);
                        text.clear();
                    }
                    _ => {}
                }
                stack.push(name);
            }
            Event::Empty(_) if verse_number.is_some() || stack.is_empty() => {
                return Err(Error::new(
                    "xml",
                    "El XML contiene una estructura no admitida.",
                ));
            }
            Event::End(element) => {
                if element.name().as_ref() == b"VERS" {
                    let verse = verse_number.take().ok_or_else(|| {
                        Error::new("xml", "El XML contiene un versículo no válido.")
                    })?;
                    verses.push(Verse {
                        book,
                        chapter,
                        verse,
                        end_verse: None,
                        text: std::mem::take(&mut text),
                    });
                }
                stack.pop();
            }
            Event::Text(value) => {
                let decoded = value.xml_content().map_err(xml_error)?;
                if stack.is_empty() && !decoded.trim().is_empty() {
                    return Err(Error::new("xml", "El XML contiene texto fuera de su raíz."));
                }
                append(
                    &stack,
                    &decoded,
                    verse_number.is_some(),
                    &mut text,
                    &mut title,
                    &mut identifier,
                    &mut rights,
                );
            }
            Event::CData(value) => {
                let decoded = value.xml_content().map_err(xml_error)?;
                append(
                    &stack,
                    &decoded,
                    verse_number.is_some(),
                    &mut text,
                    &mut title,
                    &mut identifier,
                    &mut rights,
                );
            }
            Event::GeneralRef(value) => {
                let decoded = value.decode().map_err(xml_error)?;
                append(
                    &stack,
                    &entity(&decoded)?.to_string(),
                    verse_number.is_some(),
                    &mut text,
                    &mut title,
                    &mut identifier,
                    &mut rights,
                );
            }
            Event::DocType(_) => {
                return Err(Error::new(
                    "xml",
                    "El XML contiene declaraciones no admitidas.",
                ));
            }
            Event::Eof => break,
            Event::Empty(_) | Event::Decl(_) | Event::PI(_) | Event::Comment(_) => {}
        }
    }
    if !root_seen || !stack.is_empty() {
        return Err(Error::new("xml", "El XML no es válido."));
    }
    let bible = Bible {
        id: id.into(),
        name: root_name.unwrap_or_else(|| {
            if title.is_empty() {
                filename.into()
            } else {
                title
            }
        }),
        abbreviation: if identifier.is_empty() {
            "XML".into()
        } else {
            identifier
        },
        source: "Importación local Zefania XML".into(),
        license: if rights.is_empty() {
            "Consultar derechos de la edición importada".into()
        } else {
            rights
        },
        provenance: None,
        verses,
        extra: Default::default(),
    };
    validation::bible(&bible)?;
    Ok(bible)
}
fn append(
    stack: &[String],
    value: &str,
    verse: bool,
    text: &mut String,
    title: &mut String,
    identifier: &mut String,
    rights: &mut String,
) {
    if verse {
        text.push_str(value);
    } else if stack
        .get(stack.len().saturating_sub(2))
        .is_some_and(|parent| parent == "INFORMATION")
    {
        match stack.last().map(String::as_str) {
            Some("title") => title.push_str(value),
            Some("identifier") => identifier.push_str(value),
            Some("rights") => rights.push_str(value),
            _ => {}
        }
    }
}
