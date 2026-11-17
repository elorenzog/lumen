use super::{Core, remote_content};
use crate::{
    data::domain::reference_query,
    error::{Error, Result},
    models::Slide,
};

impl Core {
    pub(super) fn step(&self, direction: i8) -> Result<Slide> {
        let output = self.output();
        let Slide::Verse {
            reference,
            translation,
            ..
        } = output.slide
        else {
            return Err(Error::new(
                "reference",
                "Proyecta un pasaje para avanzar por sus versículos.",
            ));
        };
        let (book, chapter, from, to) = reference_query(&reference).ok_or_else(|| {
            Error::new("reference", "Selecciona de nuevo el pasaje desde Biblia.")
        })?;
        let store = self.store.lock();
        let info = store
            .infos()?
            .into_iter()
            .find(|bible| bible.abbreviation == translation)
            .ok_or_else(|| {
                Error::new("reference", "Selecciona de nuevo el pasaje desde Biblia.")
            })?;
        let bible = store
            .bible(&info.id)?
            .ok_or_else(|| Error::new("bible", "La traducción no está disponible."))?;
        let boundary = if direction == 1 { to } else { from };
        let index = bible
            .verses
            .iter()
            .position(|verse| {
                verse.book == book
                    && verse.chapter == chapter
                    && verse.verse <= boundary
                    && verse.end_verse.unwrap_or(verse.verse) >= boundary
            })
            .and_then(|index| index.checked_add_signed(isize::from(direction)));
        let verse = index
            .and_then(|index| bible.verses.get(index))
            .ok_or_else(|| Error::new("reference", "No hay más versículos en esa dirección."))?;
        remote_content::passage(std::slice::from_ref(verse), &info.abbreviation)
    }
}
