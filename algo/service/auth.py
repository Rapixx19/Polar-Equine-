from fastapi import Header, HTTPException, status

from service.settings import settings


def require_bearer(authorization: str | None = Header(default=None)) -> None:
    expected = f"Bearer {settings.algo_bearer_token}"
    if authorization != expected:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid bearer",
        )
