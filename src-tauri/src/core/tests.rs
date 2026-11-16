use super::playback::Playback;
use crate::models::{Action, Slide};

#[test]
fn projection_rejects_content_mutation_when_source_is_output() {
    // Given a command that can alter the operator's library.
    let action = Action::Project {
        slide: Slide::welcome(),
    };
    // When its permission is checked for the projection window.
    let result = action.authorize("projection");
    // Then the native boundary rejects it.
    assert!(result.is_err());
}

#[test]
fn projection_accepts_only_feedback_when_source_is_output() {
    // Given the supported output feedback commands.
    let feedback = [
        Action::Snapshot,
        Action::CloseOutput,
        Action::Playback {
            playing: Some(false),
            position: Some(4.0),
            ended: None,
            revision: Some(7),
        },
        Action::MediaError {
            message: "decode".into(),
            revision: 7,
        },
        Action::BackgroundError {
            message: "image".into(),
        },
    ];
    // When each command passes through native authorization.
    let results: Vec<_> = feedback
        .iter()
        .map(|action| action.authorize("projection"))
        .collect();
    // Then projection may report playback and close itself.
    assert!(results.iter().all(Result::is_ok));
    assert!(Action::Snapshot.authorize("foreign").is_err());
}

#[test]
fn missing_edition_defaults_when_an_older_renderer_imports_hymns() {
    // Given a pre-edition renderer request.
    let request = serde_json::json!({"type":"import-hymns","folder":true});
    // When it crosses the Rust serde boundary.
    let action: Action = serde_json::from_value(request).expect("parse action");
    // Then the import uses the original unknown-edition default.
    assert!(matches!(action, Action::ImportHymns { edition, .. } if edition == "unknown"));
}

#[test]
fn camel_case_feedback_fields_survive_when_parsed_by_rust() {
    // Given a current renderer feedback message.
    let request = serde_json::json!({"type":"media-error","message":"decode","revision":9});
    // When it crosses the native contract.
    let action: Action = serde_json::from_value(request).expect("parse action");
    // Then the current output generation remains attached to the failure.
    assert!(matches!(action, Action::MediaError { revision: 9, .. }));
}

#[test]
fn oversized_utf16_input_is_rejected_when_multibyte_characters_exceed_js_limit() {
    // Given text whose Unicode scalar count is below the limit but JavaScript length exceeds it.
    let action = Action::BibleSearch {
        id: "rv1909".into(),
        query: "😀".repeat(251),
    };
    // When validated at the native boundary.
    let result = action.validate();
    // Then the shared renderer's 500 UTF-16 code-unit limit is retained.
    assert!(result.is_err());
}

#[test]
fn cancelled_preparation_cannot_commit_when_stop_overtakes_it() {
    // Given an outstanding media preparation.
    let mut playback = Playback::default();
    let first = playback.begin("first", 12.0);
    // When Stop supersedes that preparation.
    playback.cancel();
    // Then even a completed encoder cannot restore the previous hymn.
    assert!(!playback.is_current(&first));
    assert!(first.token.is_cancelled());
}

#[test]
fn latest_preparation_wins_when_requests_overtake_each_other() {
    // Given preparation for an earlier hymn.
    let mut playback = Playback::default();
    let first = playback.begin("first", 0.0);
    // When another hymn is requested.
    let second = playback.begin("second", 0.0);
    // Then only the second result can commit.
    assert!(!playback.is_current(&first));
    assert!(playback.is_current(&second));
}
