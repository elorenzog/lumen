use regex::Regex;
use unicode_normalization::{UnicodeNormalization, char::is_combining_mark};

pub const BOOKS: [&str; 66] = [
    "Génesis",
    "Éxodo",
    "Levítico",
    "Números",
    "Deuteronomio",
    "Josué",
    "Jueces",
    "Rut",
    "1 Samuel",
    "2 Samuel",
    "1 Reyes",
    "2 Reyes",
    "1 Crónicas",
    "2 Crónicas",
    "Esdras",
    "Nehemías",
    "Ester",
    "Job",
    "Salmos",
    "Proverbios",
    "Eclesiastés",
    "Cantares",
    "Isaías",
    "Jeremías",
    "Lamentaciones",
    "Ezequiel",
    "Daniel",
    "Oseas",
    "Joel",
    "Amós",
    "Abdías",
    "Jonás",
    "Miqueas",
    "Nahúm",
    "Habacuc",
    "Sofonías",
    "Hageo",
    "Zacarías",
    "Malaquías",
    "Mateo",
    "Marcos",
    "Lucas",
    "Juan",
    "Hechos",
    "Romanos",
    "1 Corintios",
    "2 Corintios",
    "Gálatas",
    "Efesios",
    "Filipenses",
    "Colosenses",
    "1 Tesalonicenses",
    "2 Tesalonicenses",
    "1 Timoteo",
    "2 Timoteo",
    "Tito",
    "Filemón",
    "Hebreos",
    "Santiago",
    "1 Pedro",
    "2 Pedro",
    "1 Juan",
    "2 Juan",
    "3 Juan",
    "Judas",
    "Apocalipsis",
];
pub const BOOK_CODES: [&str; 66] = [
    "GEN", "EXO", "LEV", "NUM", "DEU", "JOS", "JDG", "RUT", "1SA", "2SA", "1KI", "2KI", "1CH",
    "2CH", "EZR", "NEH", "EST", "JOB", "PSA", "PRO", "ECC", "SNG", "ISA", "JER", "LAM", "EZK",
    "DAN", "HOS", "JOL", "AMO", "OBA", "JON", "MIC", "NAM", "HAB", "ZEP", "HAG", "ZEC", "MAL",
    "MAT", "MRK", "LUK", "JHN", "ACT", "ROM", "1CO", "2CO", "GAL", "EPH", "PHP", "COL", "1TH",
    "2TH", "1TI", "2TI", "TIT", "PHM", "HEB", "JAS", "1PE", "2PE", "1JN", "2JN", "3JN", "JUD",
    "REV",
];

pub fn normalize(value: &str) -> String {
    value
        .nfd()
        .filter(|c| !is_combining_mark(*c))
        .collect::<String>()
        .to_lowercase()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}
pub fn reference_query(value: &str) -> Option<(u32, u32, u32, u32)> {
    let expression = Regex::new(r"^(.+?)\s+(\d+)(?:\s*[:.]\s*(\d+)(?:\s*[-–]\s*(\d+))?)?$").ok()?;
    let matched = expression.captures(value.trim())?;
    let name = normalize(matched.get(1)?.as_str())
        .trim_end_matches('.')
        .to_owned();
    let book = BOOKS
        .iter()
        .position(|book| normalize(book) == name)
        .and_then(|i| u32::try_from(i + 1).ok())
        .or_else(|| match name.replace(' ', "").as_str() {
            "gn" | "gen" => Some(1),
            "ex" => Some(2),
            "sal" | "ps" => Some(19),
            "prov" => Some(20),
            "is" => Some(23),
            "mt" | "mat" => Some(40),
            "mr" | "mc" => Some(41),
            "lc" | "luc" => Some(42),
            "jn" | "juan" => Some(43),
            "hch" => Some(44),
            "ro" | "rom" => Some(45),
            "1co" => Some(46),
            "2co" => Some(47),
            "ef" => Some(49),
            "fil" => Some(50),
            "heb" => Some(58),
            "stg" => Some(59),
            "ap" => Some(66),
            _ => None,
        })?;
    let chapter = matched.get(2)?.as_str().parse().ok()?;
    let from = matched
        .get(3)
        .map_or(Some(1), |v| v.as_str().parse().ok())?;
    let to = matched
        .get(4)
        .or_else(|| matched.get(3))
        .map_or(Some(999), |v| v.as_str().parse().ok())?;
    (chapter > 0 && from > 0 && to >= from).then_some((book, chapter, from, to))
}
