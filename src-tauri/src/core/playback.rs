use tokio_util::sync::CancellationToken;

pub(super) struct Feedback {
    pub playing: Option<bool>,
    pub position: Option<f64>,
    pub ended: bool,
    pub revision: Option<u64>,
}

#[derive(Clone)]
pub(super) struct Job {
    pub hymn_id: String,
    pub position: f64,
    pub generation: u64,
    pub token: CancellationToken,
}
#[derive(Default)]
pub(super) struct Playback {
    generation: u64,
    pending: Option<Job>,
}
impl Playback {
    pub fn begin(&mut self, hymn_id: &str, position: f64) -> Job {
        self.cancel();
        let job = Job {
            hymn_id: hymn_id.into(),
            position,
            generation: self.generation,
            token: CancellationToken::new(),
        };
        self.pending = Some(job.clone());
        job
    }
    pub fn cancel(&mut self) {
        self.generation = self.generation.wrapping_add(1);
        if let Some(job) = self.pending.take() {
            job.token.cancel();
        }
    }
    pub fn is_current(&self, job: &Job) -> bool {
        self.generation == job.generation && !job.token.is_cancelled()
    }
    pub fn pending_position(&self, hymn_id: &str) -> Option<f64> {
        self.pending
            .as_ref()
            .filter(|job| job.hymn_id == hymn_id)
            .map(|job| job.position)
    }
    pub fn has(&self, hymn_id: &str) -> bool {
        self.pending
            .as_ref()
            .is_some_and(|job| job.hymn_id == hymn_id)
    }
    pub fn complete(&mut self, job: &Job) {
        if self.is_current(job) {
            self.pending = None;
        }
    }
}
