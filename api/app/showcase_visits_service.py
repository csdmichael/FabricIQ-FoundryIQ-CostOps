from __future__ import annotations

import ipaddress
import json
import logging
from datetime import datetime, timedelta, timezone
from functools import cached_property
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from uuid import uuid4

from azure.cosmos import CosmosClient
from azure.identity import DefaultAzureCredential

from .config import Settings
from .models import ShowcaseVisit, ShowcaseVisitsReport

logger = logging.getLogger("tokenomics.showcase_visits")


class ShowcaseVisitsUnavailableError(RuntimeError):
    pass


class ShowcaseVisitService:
    def __init__(self, settings: Settings):
        self.settings = settings

    @property
    def configured(self) -> bool:
        return bool(
            self.settings.showcase_cosmos_endpoint
            and self.settings.showcase_cosmos_database
            and self.settings.showcase_cosmos_container
        )

    @cached_property
    def credential(self) -> DefaultAzureCredential:
        return DefaultAzureCredential()

    @cached_property
    def container(self):
        if not self.configured:
            raise ShowcaseVisitsUnavailableError("showcase_visits_not_configured")
        client = CosmosClient(
            self.settings.showcase_cosmos_endpoint,
            credential=self.credential,
        )
        return client.get_database_client(
            self.settings.showcase_cosmos_database
        ).get_container_client(self.settings.showcase_cosmos_container)

    def record(
        self,
        ip_address: str,
        timezone_name: str | None,
        user_agent: str | None,
    ) -> ShowcaseVisit:
        if not self.configured:
            raise ShowcaseVisitsUnavailableError("showcase_visits_not_configured")

        visited_at = datetime.now(timezone.utc)
        country_code = self._country_code(ip_address)
        visit = ShowcaseVisit(
            id=str(uuid4()),
            visitDate=visited_at.date().isoformat(),
            visitedAt=visited_at.isoformat().replace("+00:00", "Z"),
            ipAddress=ip_address,
            location=country_code or timezone_name or "Unknown",
            countryCode=country_code,
            timezone=timezone_name,
            userAgent=(user_agent or "")[:512],
        )
        self.container.create_item(visit.model_dump())
        return visit

    def report(self, days: int) -> ShowcaseVisitsReport:
        if not self.configured:
            raise ShowcaseVisitsUnavailableError("showcase_visits_not_configured")

        since = datetime.now(timezone.utc) - timedelta(days=days)
        rows = self.container.query_items(
            query=(
                "SELECT c.id, c.visitDate, c.visitedAt, c.ipAddress, c.location, "
                "c.countryCode, c.timezone, c.userAgent FROM c "
                "WHERE c.visitedAt >= @since ORDER BY c.visitedAt DESC"
            ),
            parameters=[
                {"name": "@since", "value": since.isoformat().replace("+00:00", "Z")}
            ],
            enable_cross_partition_query=True,
        )
        visits = [ShowcaseVisit(**row) for row in rows]
        return ShowcaseVisitsReport(
            generatedAt=datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            days=days,
            totalVisits=len(visits),
            uniqueVisitors=len({visit.ipAddress for visit in visits}),
            visits=visits,
        )

    def _country_code(self, ip_address: str) -> str | None:
        if not self.settings.azure_maps_client_id:
            return None
        address = ipaddress.ip_address(ip_address)
        if not address.is_global:
            return None

        try:
            token = self.credential.get_token("https://atlas.microsoft.com/.default")
            query = urlencode({"api-version": "1.0", "ip": ip_address})
            request = Request(
                f"https://atlas.microsoft.com/geolocation/ip/json?{query}",
                headers={
                    "Authorization": f"Bearer {token.token}",
                    "x-ms-client-id": self.settings.azure_maps_client_id,
                    "Accept": "application/json",
                },
            )
            with urlopen(request, timeout=3) as response:
                payload = json.load(response)
            return payload.get("countryRegion", {}).get("isoCode")
        except Exception:
            logger.exception("Azure Maps IP geolocation failed")
            return None
