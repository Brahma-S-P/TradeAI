from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_name: str = "Trading Console API"
    database_url: str = "sqlite+aiosqlite:///./trading.db"
    openai_api_key: str = ""
    kite_api_key: str = ""
    kite_api_secret: str = ""
    kite_access_token: str = ""

    model_config = {"env_file": ".env"}


settings = Settings()
