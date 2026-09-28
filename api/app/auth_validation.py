from __future__ import annotations

from functools import cached_property

import jwt
from fastapi import HTTPException

from .config import Settings


class EntraTokenValidator:
    def __init__(self, settings: Settings):
        self.settings = settings

    @cached_property
    def jwks(self) -> jwt.PyJWKClient:
        return jwt.PyJWKClient(
            f"https://login.microsoftonline.com/{self.settings.resource_tenant_id}/discovery/v2.0/keys"
        )

    def validate(self, authorization: str | None) -> dict:
        if not authorization or not authorization.startswith("Bearer "):
            raise HTTPException(status_code=401, detail="authorization_required")
        if not self.settings.resource_api_client_id:
            raise HTTPException(status_code=503, detail="api_authentication_not_configured")

        token = authorization.removeprefix("Bearer ").strip()
        try:
            signing_key = self.jwks.get_signing_key_from_jwt(token)
            claims = jwt.decode(
                token,
                signing_key.key,
                algorithms=["RS256"],
                audience=self.settings.resource_api_client_id,
                issuer=f"https://login.microsoftonline.com/{self.settings.resource_tenant_id}/v2.0",
                options={"require": ["exp", "iat", "iss", "aud"]},
            )
        except jwt.PyJWTError as exc:
            raise HTTPException(status_code=401, detail="invalid_access_token") from exc

        scopes = set(str(claims.get("scp", "")).split())
        if self.settings.delegated_scope not in scopes:
            raise HTTPException(status_code=403, detail="required_scope_missing")
        if (
            self.settings.allowed_user_object_ids
            and claims.get("oid") not in self.settings.allowed_user_object_ids
        ):
            raise HTTPException(status_code=403, detail="user_not_allowed")
        return claims
