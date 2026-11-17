use axum::{Extension, Router, extract::ConnectInfo};
use hyper::server::conn::http1;
use hyper_util::{
    rt::{TokioIo, TokioTimer},
    service::TowerToHyperService,
};
use std::time::Duration;
use tokio::{net::TcpListener, sync::watch, task::JoinSet};

pub(super) async fn serve(
    listener: TcpListener,
    router: Router,
    mut shutdown: watch::Receiver<bool>,
) {
    let mut connections = JoinSet::new();
    loop {
        tokio::select! {
            biased;
            _ = shutdown.wait_for(|closed| *closed) => break,
            accepted = listener.accept() => {
                match accepted {
                    Ok((stream, peer)) => {
                        let router = router.clone().layer(Extension(ConnectInfo(peer)));
                        connections.spawn(async move {
                            let mut builder = http1::Builder::new();
                            builder.timer(TokioTimer::new())
                                .header_read_timeout(Duration::from_secs(10))
                                .max_buf_size(8192);
                            let result = builder.serve_connection(TokioIo::new(stream), TowerToHyperService::new(router)).await;
                            if let Err(error) = result { tracing::debug!(%error, "remote.connection.closed"); }
                        });
                    }
                    Err(error) => {
                        tracing::error!(%error, "remote.accept.failed");
                        break;
                    }
                }
            }
            result = connections.join_next(), if !connections.is_empty() => {
                if let Some(Err(error)) = result { tracing::error!(%error, "remote.connection.failed"); }
            }
        }
    }
    connections.abort_all();
    while connections.join_next().await.is_some() {}
}
