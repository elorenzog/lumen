use super::{
    response::{Failure, secure},
    service::{HttpState, unavailable},
};
use axum::{
    extract::{ConnectInfo, Request, State},
    http::{HeaderMap, Method, StatusCode, header},
    middleware::Next,
    response::{IntoResponse, Response},
};
use std::{
    net::{IpAddr, Ipv4Addr, SocketAddr},
    time::Instant,
};

pub(super) async fn guard(
    State(state): State<HttpState>,
    request: Request,
    next: Next,
) -> Response {
    let mut shutdown = state.shutdown.clone();
    if *shutdown.borrow() {
        return secure(unavailable().into_response());
    }
    let valid = check(&request, state.port);
    let response = match valid {
        Err(error) => error.into_response(),
        Ok(()) => {
            state.inner.sessions.lock().expire(Instant::now());
            tokio::select! {
                biased;
                _ = shutdown.wait_for(|closed| *closed) => unavailable().into_response(),
                response = next.run(request) => response,
            }
        }
    };
    secure(response)
}
fn check(request: &Request, port: u16) -> Result<(), Failure> {
    let headers = request.headers();
    let host = headers
        .get(header::HOST)
        .and_then(|h| h.to_str().ok())
        .unwrap_or_default();
    let address = host.parse::<SocketAddr>().ok();
    let host_ok = address.is_some_and(|address| match address {
        SocketAddr::V4(address) => {
            address.port() == port && local_addresses().contains(address.ip())
        }
        SocketAddr::V6(_) => false,
    });
    if !host_ok || headers.get_all(header::HOST).iter().count() != 1 {
        return Err(Failure::new(
            StatusCode::FORBIDDEN,
            "Dirección no permitida.",
        ));
    }
    let peer = request
        .extensions()
        .get::<ConnectInfo<SocketAddr>>()
        .map(|info| info.0.ip());
    if !peer.is_some_and(is_lan) {
        return Err(Failure::new(
            StatusCode::FORBIDDEN,
            "El control está disponible en la red local.",
        ));
    }
    let method = request.method();
    if method != Method::GET && method != Method::POST {
        return Err(Failure::new(
            StatusCode::METHOD_NOT_ALLOWED,
            "Método no permitido.",
        ));
    }
    let origins = headers.get_all(header::ORIGIN);
    let mut origins = origins.iter();
    let origin = origins.next();
    if origins.next().is_some()
        || origin.is_some_and(|origin| origin.as_bytes() != format!("http://{host}").as_bytes())
        || (method == Method::POST && origin.is_none())
    {
        return Err(Failure::new(StatusCode::FORBIDDEN, "Origen no permitido."));
    }
    if headers
        .iter()
        .map(|(name, value)| name.as_str().len() + value.as_bytes().len() + 4)
        .sum::<usize>()
        > 8192
    {
        return Err(Failure::new(
            StatusCode::REQUEST_HEADER_FIELDS_TOO_LARGE,
            "La solicitud es demasiado grande.",
        ));
    }
    Ok(())
}
pub(super) fn is_lan(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(ip) => ip.is_private() || ip.is_loopback(),
        IpAddr::V6(ip) => ip
            .to_ipv4_mapped()
            .is_some_and(|ip| ip.is_private() || ip.is_loopback()),
    }
}
fn interfaces() -> Vec<(String, Ipv4Addr)> {
    local_ip_address::list_afinet_netifas()
        .unwrap_or_default()
        .into_iter()
        .filter_map(|(name, ip)| match ip {
            IpAddr::V4(ip) => Some((name, ip)),
            IpAddr::V6(_) => None,
        })
        .collect()
}
fn local_addresses() -> Vec<Ipv4Addr> {
    let mut addresses = interfaces()
        .into_iter()
        .map(|(_, ip)| ip)
        .collect::<Vec<_>>();
    addresses.push(Ipv4Addr::LOCALHOST);
    addresses
}
pub(super) fn advertised_addresses() -> Vec<Ipv4Addr> {
    let mut interfaces = interfaces();
    interfaces.sort_by_key(|(name, _)| {
        let name = name.to_lowercase();
        if [
            "virtual",
            "vmware",
            "vethernet",
            "hyper-v",
            "docker",
            "wsl",
            "tunnel",
        ]
        .iter()
        .any(|word| name.contains(word))
        {
            2
        } else if ["wi-fi", "wifi", "wlan"]
            .iter()
            .any(|word| name.contains(word))
        {
            0
        } else {
            1
        }
    });
    let mut addresses = Vec::new();
    for (_, ip) in interfaces {
        if ip.is_private() && !addresses.contains(&ip) {
            addresses.push(ip);
        }
    }
    if addresses.is_empty() {
        addresses.push(Ipv4Addr::LOCALHOST);
    }
    addresses
}
pub(super) fn session_token(headers: &HeaderMap) -> Option<String> {
    headers
        .get_all(header::COOKIE)
        .iter()
        .filter_map(|header| header.to_str().ok())
        .flat_map(|header| header.split(';'))
        .find_map(|cookie| {
            let (key, token) = cookie.trim().split_once('=')?;
            (key == "lumen_remote"
                && token.len() == 64
                && token
                    .bytes()
                    .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b)))
            .then(|| token.to_owned())
        })
}

#[cfg(test)]
#[allow(clippy::unwrap_used)]
mod tests {
    use super::*;
    #[test]
    fn only_private_and_loopback_peers_are_lan() {
        for value in [
            "127.0.0.1",
            "10.1.2.3",
            "192.168.1.5",
            "172.31.0.5",
            "::ffff:192.168.0.3",
        ] {
            assert!(is_lan(value.parse().unwrap()));
        }
        for value in ["8.8.8.8", "172.32.0.1", "169.254.1.3", "::1", "fc00::1"] {
            assert!(!is_lan(value.parse().unwrap()));
        }
    }
}
