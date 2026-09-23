"""End-to-end test for the Tokenomics Foundry agent -> APIM -> Fabric Data Agent.

Validates the full chat path a user exercises from the UI:

    this test  ->  Tokenomics Foundry agent  ->  APIM  ->  Fabric Data Agent  ->  lh_tokenomics

Because the Foundry data plane, APIM, and Key Vault all have public network access
disabled, this test MUST run from inside the private network (same context as
scripts/deploy.ps1). It is fully config-driven from config/deployment.json.

Usage (in-network):
    python scripts/test-tokenomics-agent-e2e.py
    python scripts/test-tokenomics-agent-e2e.py --question "Which department spends the most on Claude Opus?"
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]

DEFAULT_QUESTIONS = [
    "Summarize multi-cloud AI token consumption and spend by provider for the last 30 days.",
    "Which department consumes the most tokens, and on which models?",
    "From the ML insight outputs, which projects have the highest predicted budget overrun risk?",
]


def load_config() -> dict:
    with open(REPO_ROOT / "config" / "deployment.json", "r", encoding="utf-8-sig") as handle:
        return json.load(handle)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--question", action="append", help="Question(s) to ask; repeatable")
    args = parser.parse_args()
    questions = args.question or DEFAULT_QUESTIONS

    config = load_config()
    foundry = config["foundry"]
    account = foundry["accountName"]
    project = foundry["tokenomicsProjectName"]
    endpoint = f"https://{account}.services.ai.azure.com/api/projects/{project}"
    agent_name = foundry["agentName"]
    api_version = foundry.get("apiVersion", "2025-05-15-preview")

    from azure.ai.agents import AgentsClient
    from azure.identity import DefaultAzureCredential

    print(f"Connecting to Foundry project: {endpoint}")
    client = AgentsClient(
        endpoint=endpoint,
        credential=DefaultAzureCredential(exclude_interactive_browser_credential=True),
        api_version=api_version,
    )

    agent_id = None
    for agent in client.list_agents():
        if getattr(agent, "name", None) == agent_name:
            agent_id = agent.id
            break
    if not agent_id:
        print(f"FAIL: agent '{agent_name}' not found in project '{project}'. Run provision-tokenomics-foundry.py first.")
        sys.exit(1)
    print(f"Found agent '{agent_name}' -> {agent_id}")

    thread = client.threads.create()
    failures = 0
    for question in questions:
        print("\n" + "=" * 80)
        print(f"Q: {question}")
        client.messages.create(thread_id=thread.id, role="user", content=question)
        run = client.runs.create_and_process(thread_id=thread.id, agent_id=agent_id)
        status = getattr(run, "status", None)
        if status == "failed":
            print(f"FAIL: run failed: {getattr(run, 'last_error', None)}")
            failures += 1
            continue
        reply = ""
        for msg in client.messages.list(thread_id=thread.id, order="desc"):
            if getattr(msg, "role", None) == "assistant":
                for part in getattr(msg, "content", []) or []:
                    text = getattr(part, "text", None)
                    if text is not None:
                        reply = getattr(text, "value", str(text))
                break
        print(f"A: {reply[:1200]}")
        if not reply:
            failures += 1

    print("\n" + "=" * 80)
    if failures:
        print(f"E2E RESULT: {failures}/{len(questions)} question(s) failed.")
        sys.exit(1)
    print(f"E2E RESULT: PASS — all {len(questions)} questions answered by the Tokenomics agent via the Fabric Data Agent.")


if __name__ == "__main__":
    main()
