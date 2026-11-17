mod connection;
mod contracts;
mod response;
mod routes;
mod security;
mod service;
mod sessions;

pub use contracts::*;
pub use service::RemoteService;

use crate::{data::models::Verse, error::Result};
use std::{future::Future, pin::Pin};

pub type RemoteFuture<'a, T> = Pin<Box<dyn Future<Output = Result<T>> + Send + 'a>>;
pub trait RemoteAdapter: Send + Sync {
    fn state(&self) -> RemoteFuture<'_, RemoteState>;
    fn library(&self) -> RemoteFuture<'_, RemoteLibrary>;
    fn search(&self, input: RemoteSearch) -> RemoteFuture<'_, Vec<Verse>>;
    fn command(&self, input: RemoteCommand) -> RemoteFuture<'_, RemoteState>;
}

#[cfg(test)]
#[allow(clippy::unwrap_used, clippy::expect_used)]
mod boundary_tests;
#[cfg(test)]
#[allow(clippy::unwrap_used, clippy::expect_used)]
mod lifecycle_tests;
#[cfg(test)]
#[allow(clippy::unwrap_used, clippy::expect_used)]
mod test_support;
#[cfg(test)]
#[allow(clippy::unwrap_used, clippy::expect_used)]
mod tests;
