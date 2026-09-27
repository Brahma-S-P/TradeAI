from __future__ import annotations

import logging
from datetime import datetime, timedelta
from typing import Any

from kiteconnect import KiteConnect, KiteTicker
from kiteconnect.exceptions import TokenException

from app.core.config import settings

log = logging.getLogger(__name__)


class KiteService:
    def __init__(self) -> None:
        self._kite = KiteConnect(api_key=settings.kite_api_key)
        self._access_token: str | None = settings.kite_access_token or None
        self._ticker: KiteTicker | None = None
        self._last_ping: datetime | None = None
        self._last_ping_ok: bool = False
        self._ping_cache_seconds = 10
        if self._access_token:
            self._kite.set_access_token(self._access_token)

    @property
    def is_connected(self) -> bool:
        return self._access_token is not None

    def _invalidate(self) -> None:
        log.warning("Kite token expired — clearing session")
        self._access_token = None
        self._last_ping_ok = False

    def ping(self) -> dict[str, Any]:
        """Lightweight connectivity check with short-lived cache to avoid hammering Kite."""
        if not self._access_token:
            return {"ok": False, "reason": "no_token"}
        now = datetime.now()
        if (
            self._last_ping
            and (now - self._last_ping).total_seconds() < self._ping_cache_seconds
        ):
            return {"ok": self._last_ping_ok, "cached": True}
        try:
            profile = self._kite.profile()
            self._last_ping = now
            self._last_ping_ok = True
            return {
                "ok": True,
                "user_id": profile.get("user_id"),
                "user_name": profile.get("user_name"),
            }
        except TokenException:
            self._invalidate()
            self._last_ping = now
            return {"ok": False, "reason": "token_expired"}
        except Exception as exc:
            self._last_ping = now
            self._last_ping_ok = False
            return {"ok": False, "reason": str(exc)}

    @property
    def kite(self) -> KiteConnect:
        return self._kite

    @property
    def login_url(self) -> str:
        return self._kite.login_url()

    def generate_session(self, request_token: str) -> dict[str, Any]:
        data = self._kite.generate_session(
            request_token, api_secret=settings.kite_api_secret
        )
        self._access_token = data["access_token"]
        self._kite.set_access_token(self._access_token)
        log.info("Kite session established for user %s", data.get("user_id"))
        return data

    def get_profile(self) -> dict[str, Any]:
        try:
            return self._kite.profile()
        except TokenException:
            self._invalidate()
            raise

    def get_positions(self) -> dict[str, Any]:
        return self._kite.positions()

    def get_holdings(self) -> list[dict[str, Any]]:
        return self._kite.holdings()

    def get_orders(self) -> list[dict[str, Any]]:
        return self._kite.orders()

    def get_quote(self, instruments: list[str]) -> dict[str, Any]:
        try:
            return self._kite.quote(instruments)
        except TokenException:
            self._invalidate()
            raise

    def get_ltp(self, instruments: list[str]) -> dict[str, Any]:
        return self._kite.ltp(instruments)

    def get_ohlc(self, instruments: list[str]) -> dict[str, Any]:
        return self._kite.ohlc(instruments)

    def get_historical_data(
        self,
        instrument_token: int,
        from_date: datetime,
        to_date: datetime,
        interval: str = "day",
    ) -> list[dict[str, Any]]:
        try:
            return self._kite.historical_data(
                instrument_token, from_date, to_date, interval
            )
        except TokenException:
            self._invalidate()
            raise

    def get_instruments(self, exchange: str = "NSE") -> list[dict[str, Any]]:
        try:
            return self._kite.instruments(exchange)
        except TokenException:
            self._invalidate()
            raise

    def place_order(
        self,
        exchange: str,
        tradingsymbol: str,
        transaction_type: str,
        quantity: int,
        order_type: str = "MARKET",
        price: float | None = None,
        trigger_price: float | None = None,
        product: str = "CNC",
        variety: str = "regular",
        stoploss: float | None = None,
        target: float | None = None,
    ) -> str:
        params: dict[str, Any] = {
            "exchange": exchange,
            "tradingsymbol": tradingsymbol,
            "transaction_type": transaction_type,
            "quantity": quantity,
            "order_type": order_type,
            "product": product,
            "variety": variety,
        }
        if price is not None:
            params["price"] = price
        if trigger_price is not None:
            params["trigger_price"] = trigger_price

        order_id = self._kite.place_order(**params)
        log.info("Order placed: %s %s %s x%d → %s", transaction_type, exchange, tradingsymbol, quantity, order_id)

        if stoploss and order_id:
            self._place_sl_order(exchange, tradingsymbol, transaction_type, quantity, stoploss, product)

        return order_id

    def _place_sl_order(
        self, exchange: str, tradingsymbol: str, transaction_type: str,
        quantity: int, trigger_price: float, product: str,
    ) -> str | None:
        sl_side = "SELL" if transaction_type == "BUY" else "BUY"
        try:
            return self._kite.place_order(
                variety="regular",
                exchange=exchange,
                tradingsymbol=tradingsymbol,
                transaction_type=sl_side,
                quantity=quantity,
                order_type="SL-M",
                trigger_price=trigger_price,
                product=product,
            )
        except Exception:
            log.exception("Failed to place SL order for %s", tradingsymbol)
            return None

    def cancel_order(self, order_id: str, variety: str = "regular") -> str:
        return self._kite.cancel_order(variety=variety, order_id=order_id)

    def get_margins(self) -> dict[str, Any]:
        return self._kite.margins()

    def create_ticker(self) -> KiteTicker | None:
        if not self._access_token:
            return None
        self._ticker = KiteTicker(settings.kite_api_key, self._access_token)
        return self._ticker


kite_service = KiteService()
