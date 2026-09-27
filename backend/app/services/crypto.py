"""AES-256-GCM encryption with PBKDF2 key derivation from a user password."""

import base64
import hashlib
import os

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes

_ITERATIONS = 600_000


def _derive_key(password: str, salt: bytes) -> bytes:
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=salt,
        iterations=_ITERATIONS,
    )
    return kdf.derive(password.encode("utf-8"))


def encrypt(plaintext: str, password: str) -> tuple[str, str, str]:
    """Return (ciphertext_b64, salt_hex, iv_hex)."""
    salt = os.urandom(16)
    iv = os.urandom(12)
    key = _derive_key(password, salt)
    aesgcm = AESGCM(key)
    ct = aesgcm.encrypt(iv, plaintext.encode("utf-8"), None)
    return base64.b64encode(ct).decode(), salt.hex(), iv.hex()


def decrypt(ciphertext_b64: str, password: str, salt_hex: str, iv_hex: str) -> str:
    """Return the decrypted plaintext. Raises on wrong password."""
    salt = bytes.fromhex(salt_hex)
    iv = bytes.fromhex(iv_hex)
    key = _derive_key(password, salt)
    aesgcm = AESGCM(key)
    ct = base64.b64decode(ciphertext_b64)
    return aesgcm.decrypt(iv, ct, None).decode("utf-8")


def hash_password(password: str) -> tuple[str, str]:
    """Return (hash_hex, salt_hex) for password verification."""
    salt = os.urandom(16)
    h = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, _ITERATIONS)
    return h.hex(), salt.hex()


def verify_password(password: str, hash_hex: str, salt_hex: str) -> bool:
    salt = bytes.fromhex(salt_hex)
    h = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, _ITERATIONS)
    return h.hex() == hash_hex
