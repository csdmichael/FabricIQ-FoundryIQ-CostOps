"""Foundry agent chat service (Tokenomics FinOps Analyst).

Bridges the UI chat to the **Tokenomics FinOps Analyst** agent hosted in the
Microsoft Foundry ``Tokenomics`` project (public ``foundry-myaacoub`` account).
The agent answers by calling function tools that this service fulfills against the
governed Fabric ``lh_tokenomics`` lakehouse — the same Gold and ML tables the
Fabric Data Agent uses. Full path:

    UI  ->  FastAPI /chat  ->  Foundry agent (gpt-5.2 + function tools)
                                   |
                                   v
                         Fabric lh_tokenomics (Gold + 12 ML outputs)

Authentication uses ``DefaultAzureCredential`` (managed identity in App Service),
so no secret is stored. Agent runs are traced to Application Insights when a
connection string is configured.
"""
from __future__ import annotations

import json
import logging
from typing import Optional

from .agent_tools import TokenomicsTools, tool_definitions
from .config import FoundrySettings, Settings
from .fabric_client import FabricSqlClient

logger = logging.getLogger("tokenomics.agent")


class AgentUnavailableError(RuntimeError):
    """Raised when the Foundry agent cannot be reached or is not configured."""


class AgentChatService:
    def __init__(self, settings: Settings, client: FabricSqlClient) -> None:
        self._settings = settings
        self._foundry: Optional[FoundrySettings] = settings.foundry
        self._tools = TokenomicsTools(settings, client)
        self._client = None
        self._agent_id: Optional[str] = None
        self._traced = False

    @property
    def configured(self) -> bool:
        return bool(self._foundry and self._foundry.configured)

    # -- tracing ---------------------------------------------------------
    def _configure_tracing(self) -> None:
        if self._traced or not self._foundry or not self._foundry.tracing_enabled:
            return
        import os

        conn = os.environ.get(self._foundry.tracing_conn_env, "")
        if not conn:
            logger.info("Agent tracing enabled but no App Insights connection string present.")
            self._traced = True
            return
        try:
            if self._foundry.tracing_content_recording:
                os.environ.setdefault("AZURE_TRACING_GEN_AI_CONTENT_RECORDING_ENABLED", "true")
            from azure.monitor.opentelemetry import configure_azure_monitor

            configure_azure_monitor(connection_string=conn)
            try:
                from azure.ai.agents.telemetry import AIAgentsInstrumentor

                AIAgentsInstrumentor().instrument()
            except Exception as exc:  # pragma: no cover - optional
                logger.info("Agents instrumentor unavailable: %s", exc)
            logger.info("Foundry agent tracing configured to Application Insights.")
        except Exception as exc:  # pragma: no cover - optional
            logger.warning("Failed to configure agent tracing: %s", exc)
        finally:
            self._traced = True

    # -- client / agent --------------------------------------------------
    def _get_client(self):
        if self._client is not None:
            return self._client
        if not self.configured:
            raise AgentUnavailableError("foundry_agent_not_configured")
        self._configure_tracing()
        from azure.ai.agents import AgentsClient
        from azure.identity import DefaultAzureCredential

        credential = DefaultAzureCredential(exclude_interactive_browser_credential=True)
        self._client = AgentsClient(
            endpoint=self._foundry.project_endpoint,
            credential=credential,
            api_version=self._foundry.api_version,
        )
        return self._client

    def _ensure_agent(self) -> str:
        """Create or reuse the Tokenomics agent (idempotent by name)."""
        if self._agent_id:
            return self._agent_id
        client = self._get_client()
        f = self._foundry
        for agent in client.list_agents():
            if getattr(agent, "name", None) == f.agent_name:
                self._agent_id = agent.id
                try:
                    client.update_agent(
                        agent_id=agent.id,
                        model=f.model_deployment,
                        name=f.agent_name,
                        instructions=f.instructions,
                        tools=tool_definitions(),
                    )
                except Exception as exc:  # pragma: no cover
                    logger.info("Agent update skipped: %s", exc)
                return self._agent_id
        created = client.create_agent(
            model=f.model_deployment,
            name=f.agent_name,
            instructions=f.instructions,
            tools=tool_definitions(),
        )
        self._agent_id = created.id
        logger.info("Created Tokenomics agent %s", created.id)
        return self._agent_id

    # -- chat ------------------------------------------------------------
    def chat(self, message: str, thread_id: Optional[str] = None) -> dict:
        try:
            client = self._get_client()
            agent_id = self._ensure_agent()
            thread = client.threads.get(thread_id) if thread_id else client.threads.create()
            client.messages.create(thread_id=thread.id, role="user", content=message)

            run = client.runs.create(thread_id=thread.id, agent_id=agent_id)
            run = self._drive_run(client, thread.id, run)

            if getattr(run, "status", None) == "failed":
                raise AgentUnavailableError(f"foundry_run_failed: {getattr(run, 'last_error', None)}")

            reply_text = ""
            for msg in client.messages.list(thread_id=thread.id, order="desc"):
                if getattr(msg, "role", None) == "assistant":
                    for part in getattr(msg, "content", []) or []:
                        text = getattr(part, "text", None)
                        if text is not None:
                            reply_text = getattr(text, "value", str(text))
                    break

            return {
                "reply": reply_text or "The Tokenomics agent returned no content.",
                "threadId": thread.id,
                "citations": [],
            }
        except AgentUnavailableError:
            raise
        except Exception as exc:  # pragma: no cover - network dependent
            logger.exception("Foundry agent chat failed")
            raise AgentUnavailableError(f"foundry_agent_error: {exc}") from exc

    def _drive_run(self, client, thread_id: str, run):
        """Poll the run and fulfill tool calls against the Fabric lakehouse."""
        import time

        for _ in range(60):
            status = getattr(run, "status", None)
            if status in ("completed", "failed", "cancelled", "expired"):
                return run
            if status == "requires_action":
                action = getattr(run, "required_action", None)
                submit = getattr(action, "submit_tool_outputs", None)
                tool_calls = getattr(submit, "tool_calls", []) if submit else []
                outputs = []
                for call in tool_calls:
                    fn = getattr(call, "function", None)
                    name = getattr(fn, "name", "")
                    try:
                        args = json.loads(getattr(fn, "arguments", "") or "{}")
                    except json.JSONDecodeError:
                        args = {}
                    outputs.append({"tool_call_id": call.id, "output": self._tools.dispatch(name, args)})
                run = client.runs.submit_tool_outputs(thread_id=thread_id, run_id=run.id, tool_outputs=outputs)
                continue
            time.sleep(1)
            run = client.runs.get(thread_id=thread_id, run_id=run.id)
        return run
