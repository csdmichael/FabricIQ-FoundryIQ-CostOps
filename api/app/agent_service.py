"""Foundry agent chat service.

Bridges the UI chat to the **Tokenomics FinOps Analyst** agent hosted in the
Microsoft Foundry ``Tokenomics`` project. That agent answers questions by calling
the **Fabric Data Agent** through the APIM gateway (MCP), so the full path is:

    UI  ->  FastAPI /chat  ->  Foundry agent  ->  APIM  ->  Fabric Data Agent

The Foundry project endpoint, agent name, and API version are all read from
config (``foundry`` section). Authentication uses ``DefaultAzureCredential`` so
the service works with a managed identity in Azure App Service (in-network) with
no stored secret. Nothing here is mocked; if Foundry is unreachable the caller
receives an explicit error.
"""
from __future__ import annotations

import logging
from typing import Optional

from .config import FoundrySettings

logger = logging.getLogger("tokenomics.agent")


class AgentUnavailableError(RuntimeError):
    """Raised when the Foundry agent cannot be reached or is not configured."""


class AgentChatService:
    def __init__(self, foundry: Optional[FoundrySettings]) -> None:
        self._foundry = foundry
        self._client = None
        self._agent_id: Optional[str] = None

    @property
    def configured(self) -> bool:
        return bool(self._foundry and self._foundry.configured)

    def _get_client(self):
        if self._client is not None:
            return self._client
        if not self.configured:
            raise AgentUnavailableError("foundry_agent_not_configured")
        # Imported lazily so the rest of the API works without the agents SDK.
        from azure.ai.agents import AgentsClient
        from azure.identity import DefaultAzureCredential

        credential = DefaultAzureCredential(exclude_interactive_browser_credential=True)
        self._client = AgentsClient(
            endpoint=self._foundry.project_endpoint,
            credential=credential,
            api_version=self._foundry.api_version,
        )
        return self._client

    def _resolve_agent_id(self) -> str:
        if self._agent_id:
            return self._agent_id
        client = self._get_client()
        target = self._foundry.agent_name
        for agent in client.list_agents():
            name = getattr(agent, "name", None)
            if name == target or getattr(agent, "id", None) == target:
                self._agent_id = agent.id
                return self._agent_id
        raise AgentUnavailableError(f"foundry_agent_not_found: {target}")

    def chat(self, message: str, thread_id: Optional[str] = None) -> dict:
        """Send a message to the Foundry agent and return its reply.

        Returns a dict: {reply, threadId, citations}. Raises
        ``AgentUnavailableError`` when the agent is not reachable.
        """
        try:
            client = self._get_client()
            agent_id = self._resolve_agent_id()

            thread = (
                client.threads.get(thread_id) if thread_id else client.threads.create()
            )
            client.messages.create(thread_id=thread.id, role="user", content=message)
            run = client.runs.create_and_process(thread_id=thread.id, agent_id=agent_id)

            if getattr(run, "status", None) == "failed":
                detail = getattr(run, "last_error", None)
                raise AgentUnavailableError(f"foundry_run_failed: {detail}")

            reply_text = ""
            citations: list[str] = []
            for msg in client.messages.list(thread_id=thread.id, order="desc"):
                if getattr(msg, "role", None) == "assistant":
                    for part in getattr(msg, "content", []) or []:
                        text = getattr(part, "text", None)
                        if text is not None:
                            reply_text = getattr(text, "value", str(text))
                            for annotation in getattr(text, "annotations", []) or []:
                                url = getattr(getattr(annotation, "url_citation", None), "url", None)
                                if url:
                                    citations.append(url)
                    break

            return {
                "reply": reply_text or "The Tokenomics agent returned no content.",
                "threadId": thread.id,
                "citations": citations,
            }
        except AgentUnavailableError:
            raise
        except Exception as exc:  # pragma: no cover - network dependent
            logger.exception("Foundry agent chat failed")
            raise AgentUnavailableError(f"foundry_agent_error: {exc}") from exc
