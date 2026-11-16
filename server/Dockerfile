# The API host builds this image; Vercel does not build Rust.
FROM rust:1.99-bookworm AS build
WORKDIR /app

# Compile dependencies in their own layer so source edits reuse it.
COPY Cargo.toml Cargo.lock ./
RUN mkdir src \
    && : > src/lib.rs \
    && printf 'fn main() {}\n' > src/main.rs \
    && cargo build --release \
    && rm -rf src target/release/deps/*server* target/release/server*

COPY src ./src
RUN cargo build --release

FROM debian:bookworm-slim AS runtime
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /app/target/release/server /usr/local/bin/server

# BIND wins over PORT; the host usually sets PORT, so bind every interface.
ENV PORT=8080
EXPOSE 8080
CMD ["server"]
