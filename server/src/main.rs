#[tokio::main]
async fn main() {
    let config = server::Config::from_env().unwrap_or_else(|err| {
        eprintln!("{err}");
        std::process::exit(1);
    });
    if let Err(err) = server::serve(config).await {
        eprintln!("{err}");
        std::process::exit(1);
    }
}
