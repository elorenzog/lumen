use crate::remote::{RemoteHymn, RemoteLibrary, RemoteOldHymn, RemoteTrack};
use crate::{
    data::domain::{BOOKS, normalize},
    error::{Error, Result},
    models::{Hymn, OldHymnCatalogEntry, Slide, Verse},
};

pub(super) fn library(hymns: &[Hymn], old: &[OldHymnCatalogEntry]) -> RemoteLibrary {
    let current = hymns
        .iter()
        .map(|hymn| RemoteHymn {
            id: hymn.id.clone(),
            number: hymn.number,
            title: hymn.title.clone(),
            number1962: hymn
                .metadata
                .number1962
                .or_else(|| (hymn.metadata.edition == "1962").then_some(hymn.number)),
            number2009: hymn
                .metadata
                .number2009
                .or_else(|| (hymn.metadata.edition == "2009").then_some(hymn.number)),
            tracks: hymn
                .tracks
                .iter()
                .map(|track| RemoteTrack {
                    index: track.index,
                    label: track.label.clone(),
                })
                .collect(),
            duration: hymn.duration,
        })
        .collect();
    let old = old
        .iter()
        .map(|entry| {
            let media: Vec<_> = hymns
                .iter()
                .filter(|hymn| {
                    hymn.metadata
                        .number1962
                        .or_else(|| (hymn.metadata.edition == "1962").then_some(hymn.number))
                        == Some(entry.number)
                })
                .collect();
            let conflict =
                media.len() > 1 || media.iter().any(|hymn| hymn.metadata.numbering_conflict);
            let matching: Vec<_> = media
                .iter()
                .filter(|hymn| title_key(&hymn.title) == title_key(&entry.title))
                .collect();
            let playable = if conflict {
                match matching.as_slice() {
                    [hymn] => Some(hymn.id.clone()),
                    _ => None,
                }
            } else {
                media.first().map(|hymn| hymn.id.clone())
            };
            RemoteOldHymn {
                number: entry.number,
                title: entry.title.clone(),
                hymn_id: playable,
            }
        })
        .collect();
    RemoteLibrary {
        hymns: current,
        old,
    }
}
fn title_key(value: &str) -> String {
    normalize(value)
        .split(|c: char| !c.is_alphanumeric())
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join(" ")
}
pub(super) fn select_range(chapter: &[Verse], range: &str) -> Result<Vec<Verse>> {
    let normalized = range.replace('–', "-");
    let mut parts = normalized.split('-');
    let from = parts
        .next()
        .and_then(|value| value.trim().parse::<u32>().ok());
    let to = parts
        .next()
        .map(|value| value.trim().parse::<u32>())
        .transpose()
        .map_err(|_| invalid_range())?;
    let Some(from) = from else {
        return Err(invalid_range());
    };
    if parts.next().is_some() {
        return Err(invalid_range());
    }
    let to = to.unwrap_or(from);
    if from > to {
        return Err(Error::new(
            "range",
            "El inicio del rango debe ser menor o igual al final.",
        ));
    }
    let selected: Vec<_> = chapter
        .iter()
        .filter(|verse| verse.end_verse.unwrap_or(verse.verse) >= from && verse.verse <= to)
        .cloned()
        .collect();
    let contains = |number| {
        selected
            .iter()
            .any(|verse| verse.verse <= number && verse.end_verse.unwrap_or(verse.verse) >= number)
    };
    if selected.is_empty() || !contains(from) || !contains(to) {
        return Err(Error::new(
            "range",
            "Ese versículo no está disponible en este capítulo.",
        ));
    }
    if selected.len() > 6 {
        return Err(Error::new(
            "range",
            "Selecciona hasta 6 versículos por diapositiva.",
        ));
    }
    Ok(selected)
}
fn invalid_range() -> Error {
    Error::new(
        "range",
        "Escribe un versículo o un rango, por ejemplo: 16 o 16-18.",
    )
}
pub(super) fn passage(verses: &[Verse], translation: &str) -> Result<Slide> {
    let first = verses
        .first()
        .ok_or_else(|| Error::new("reference", "No se encontró ese pasaje."))?;
    let last = verses
        .last()
        .ok_or_else(|| Error::new("reference", "No se encontró ese pasaje."))?;
    let index = usize::try_from(first.book.saturating_sub(1)).map_err(|_| invalid_range())?;
    let book = BOOKS.get(index).copied().unwrap_or("Libro");
    let end = last.end_verse.unwrap_or(last.verse);
    let range = if end > first.verse {
        format!("–{end}")
    } else {
        String::new()
    };
    Ok(Slide::Verse {
        text: verses
            .iter()
            .map(|verse| verse.text.as_str())
            .collect::<Vec<_>>()
            .join("\n"),
        reference: format!("{book} {}:{}{range}", first.chapter, first.verse),
        translation: translation.into(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn bridged_verses_remain_whole_when_selecting_an_enclosed_number() {
        // Given one original combined verse.
        let chapter = vec![Verse {
            book: 43,
            chapter: 3,
            verse: 16,
            end_verse: Some(17),
            text: "Original".into(),
        }];
        // When selecting a number inside its bridge.
        let selected = select_range(&chapter, "17").expect("select");
        // Then the original wording and its bridge survive projection.
        assert_eq!(selected, chapter);
        assert!(
            matches!(passage(&selected, "RV").expect("slide"), Slide::Verse { reference, .. } if reference == "Juan 3:16–17")
        );
    }
    #[test]
    fn excessive_range_is_rejected_when_it_spans_seven_rows() {
        // Given seven consecutive verses.
        let chapter: Vec<_> = (1..=7)
            .map(|verse| Verse {
                book: 43,
                chapter: 3,
                verse,
                end_verse: None,
                text: "Texto".into(),
            })
            .collect();
        // When requesting all seven on one slide.
        let result = select_range(&chapter, "1-7");
        // Then the existing six-row limit remains effective.
        assert!(result.is_err());
    }
}
