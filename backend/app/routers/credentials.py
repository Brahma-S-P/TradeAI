from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.credential import Credential
from app.services.crypto import encrypt, decrypt, hash_password, verify_password

router = APIRouter(prefix="/api/credentials", tags=["credentials"])


class SaveRequest(BaseModel):
    password: str
    credentials: dict[str, str]
    password_hint: str | None = None


class UnlockRequest(BaseModel):
    password: str


class DeleteRequest(BaseModel):
    password: str
    key_name: str


@router.get("")
async def check_credentials(db: AsyncSession = Depends(get_db)):
    """Return which credential keys exist (no values), plus password hint."""
    result = await db.execute(select(Credential.key_name))
    keys = [row[0] for row in result.fetchall()]
    real_keys = [k for k in keys if k != "__password_hint__"]

    hint = ""
    hint_row = await db.execute(
        select(Credential.encrypted_value).where(Credential.key_name == "__password_hint__")
    )
    row = hint_row.scalar_one_or_none()
    if row:
        hint = row

    return {"keys": real_keys, "has_credentials": len(real_keys) > 0, "password_hint": hint}


@router.post("/save")
async def save_credentials(req: SaveRequest, db: AsyncSession = Depends(get_db)):
    """Encrypt and store credentials. Overwrites existing keys."""
    if len(req.password) < 6:
        raise HTTPException(400, "Password must be at least 6 characters")

    pw_hash, pw_salt = hash_password(req.password)

    for key_name, value in req.credentials.items():
        if not value.strip():
            continue
        ct, salt, iv = encrypt(value.strip(), req.password)

        existing = await db.execute(
            select(Credential).where(Credential.key_name == key_name)
        )
        cred = existing.scalar_one_or_none()

        if cred:
            cred.encrypted_value = ct
            cred.salt = salt
            cred.iv = iv
            cred.password_hash = pw_hash
            cred.password_salt = pw_salt
        else:
            cred = Credential(
                key_name=key_name,
                encrypted_value=ct,
                salt=salt,
                iv=iv,
                password_hash=pw_hash,
                password_salt=pw_salt,
            )
            db.add(cred)

    if req.password_hint is not None:
        existing_hint = await db.execute(
            select(Credential).where(Credential.key_name == "__password_hint__")
        )
        hint_row = existing_hint.scalar_one_or_none()
        if hint_row:
            hint_row.encrypted_value = req.password_hint
        else:
            hint_row = Credential(
                key_name="__password_hint__",
                encrypted_value=req.password_hint,
                salt="",
                iv="",
                password_hash=pw_hash,
                password_salt=pw_salt,
            )
            db.add(hint_row)

    await db.commit()
    return {"status": "saved", "keys": list(req.credentials.keys())}


@router.post("/unlock")
async def unlock_credentials(req: UnlockRequest, db: AsyncSession = Depends(get_db)):
    """Decrypt all credentials with the provided password."""
    result = await db.execute(select(Credential))
    creds = result.scalars().all()

    if not creds:
        raise HTTPException(404, "No credentials stored")

    first = creds[0]
    if not verify_password(req.password, first.password_hash, first.password_salt):
        raise HTTPException(403, "Wrong password")

    decrypted: dict[str, str] = {}
    for c in creds:
        if c.key_name == "__password_hint__":
            continue
        try:
            decrypted[c.key_name] = decrypt(
                c.encrypted_value, req.password, c.salt, c.iv
            )
        except Exception:
            decrypted[c.key_name] = ""

    return {"credentials": decrypted}


@router.post("/delete")
async def delete_credential(req: DeleteRequest, db: AsyncSession = Depends(get_db)):
    """Delete a single credential after password verification."""
    result = await db.execute(
        select(Credential).where(Credential.key_name == req.key_name)
    )
    cred = result.scalar_one_or_none()
    if not cred:
        raise HTTPException(404, "Credential not found")

    if not verify_password(req.password, cred.password_hash, cred.password_salt):
        raise HTTPException(403, "Wrong password")

    await db.delete(cred)
    await db.commit()
    return {"status": "deleted", "key_name": req.key_name}


@router.post("/delete-all")
async def delete_all_credentials(req: UnlockRequest, db: AsyncSession = Depends(get_db)):
    """Delete all credentials after password verification."""
    result = await db.execute(select(Credential))
    creds = result.scalars().all()
    if not creds:
        raise HTTPException(404, "No credentials stored")

    if not verify_password(req.password, creds[0].password_hash, creds[0].password_salt):
        raise HTTPException(403, "Wrong password")

    for c in creds:
        await db.delete(c)
    await db.commit()
    return {"status": "deleted_all"}
