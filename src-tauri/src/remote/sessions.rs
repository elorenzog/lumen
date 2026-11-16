use super::response::Failure;
use axum::http::StatusCode;
use std::{
    collections::HashMap,
    net::IpAddr,
    time::{Duration, Instant},
};
use subtle::ConstantTimeEq;

#[derive(Default)]
pub(super) struct Sessions {
    pub pin: String,
    tokens: HashMap<String, Instant>,
    attempts: HashMap<IpAddr, Attempt>,
}
struct Attempt {
    count: u8,
    until: Instant,
}
impl Sessions {
    pub fn expire(&mut self, now: Instant) {
        self.tokens.retain(|_, until| *until >= now);
        self.attempts.retain(|_, entry| entry.until >= now);
    }
    pub fn devices(&self) -> usize {
        self.tokens.len()
    }
    pub fn rotate(&mut self) {
        let previous = self.pin.clone();
        loop {
            self.pin = rand::random_range(100000..1000000).to_string();
            if self.pin != previous {
                break;
            }
        }
        self.tokens.clear();
        self.attempts.clear();
    }
    pub fn close(&mut self) {
        self.pin.clear();
        self.tokens.clear();
        self.attempts.clear();
    }
    pub fn attempt(&mut self, peer: IpAddr, now: Instant) -> Result<(), Failure> {
        self.expire(now);
        if self
            .attempts
            .get(&peer)
            .is_some_and(|entry| entry.count >= 5)
        {
            return Err(Failure::new(
                StatusCode::TOO_MANY_REQUESTS,
                "Demasiados intentos. Espera un minuto antes de volver a intentar.",
            ));
        }
        if self.attempts.len() >= 128 && !self.attempts.contains_key(&peer) {
            return Err(Failure::new(
                StatusCode::TOO_MANY_REQUESTS,
                "Espera un minuto y reintenta.",
            ));
        }
        let entry = self.attempts.entry(peer).or_insert(Attempt {
            count: 0,
            until: now + Duration::from_secs(60),
        });
        entry.count += 1;
        Ok(())
    }
    pub fn pair(&mut self, peer: IpAddr, pin: &str, now: Instant) -> Result<String, Failure> {
        if pin.len() != 6
            || !pin.bytes().all(|b| b.is_ascii_digit())
            || !bool::from(pin.as_bytes().ct_eq(self.pin.as_bytes()))
        {
            return Err(Failure::new(
                StatusCode::UNAUTHORIZED,
                "PIN incorrecto. Consulta el código en Ajustes de LUMEN.",
            ));
        }
        self.expire(now);
        if self.tokens.len() >= 20 {
            return Err(Failure::new(
                StatusCode::TOO_MANY_REQUESTS,
                "Ya hay 20 teléfonos vinculados. Renueva el PIN desde LUMEN.",
            ));
        }
        self.attempts.remove(&peer);
        let random = rand::random::<[u8; 32]>();
        let mut token = String::with_capacity(64);
        for byte in random {
            const HEX: &[u8; 16] = b"0123456789abcdef";
            token.push(char::from(HEX[usize::from(byte >> 4)]));
            token.push(char::from(HEX[usize::from(byte & 15)]));
        }
        self.tokens
            .insert(token.clone(), now + Duration::from_secs(28800));
        Ok(token)
    }
    pub fn authenticated(&mut self, token: &str, now: Instant) -> bool {
        self.expire(now);
        self.tokens.contains_key(token)
    }
    pub fn logout(&mut self, token: &str) {
        self.tokens.remove(token);
    }
}

#[cfg(test)]
#[allow(clippy::unwrap_used)]
mod tests {
    use super::*;
    #[test]
    fn pairing_is_limited_to_twenty_sessions() {
        let mut sessions = Sessions::default();
        sessions.rotate();
        let now = Instant::now();
        let peer = "127.0.0.1".parse().unwrap();
        let pin = sessions.pin.clone();
        for _ in 0..20 {
            sessions.pair(peer, &pin, now).unwrap();
        }
        assert_eq!(
            sessions.pair(peer, &pin, now).unwrap_err().0,
            StatusCode::TOO_MANY_REQUESTS
        );
    }
    #[test]
    fn attempt_buckets_are_bounded_even_across_different_peers() {
        let mut sessions = Sessions::default();
        let now = Instant::now();
        for index in 0..128 {
            sessions
                .attempt(std::net::Ipv4Addr::new(10, 0, 0, index).into(), now)
                .unwrap();
        }
        assert_eq!(
            sessions
                .attempt("10.0.1.1".parse().unwrap(), now)
                .unwrap_err()
                .0,
            StatusCode::TOO_MANY_REQUESTS
        );
    }
    #[test]
    fn tokens_expire_after_eight_hours() {
        let mut sessions = Sessions::default();
        sessions.rotate();
        let now = Instant::now();
        let token = sessions
            .pair("127.0.0.1".parse().unwrap(), &sessions.pin.clone(), now)
            .unwrap();
        assert!(!sessions.authenticated(&token, now + Duration::from_secs(28801)));
    }
    #[test]
    fn attempts_expire_after_one_minute() {
        let mut sessions = Sessions::default();
        let now = Instant::now();
        let peer = "127.0.0.1".parse().unwrap();
        for _ in 0..5 {
            sessions.attempt(peer, now).unwrap();
        }
        assert!(sessions.attempt(peer, now).is_err());
        assert!(
            sessions
                .attempt(peer, now + Duration::from_secs(61))
                .is_ok()
        );
    }
}
