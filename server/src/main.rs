fn main() {
    server::load_dotenv();
    tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
        .expect("runtime")
        .block_on(async {
            let config = server::Config::from_env().unwrap_or_else(|err| {
                eprintln!("{err}");
                std::process::exit(1);
            });
            if let Err(err) = server::serve(config).await {
                eprintln!("{err}");
                std::process::exit(1);
            }
        });
}
