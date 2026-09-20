import hashlib
from pathlib import Path
from typing import Any

from azure.ai.projects.models import AutoCodeInterpreterToolParam, CodeInterpreterTool, FileSearchTool


def discover_knowledge_files(repository_root: Path, agent_kind: str) -> list[Path]:
    knowledge_root = repository_root / "agents" / agent_kind / "knowledge" / "files"
    files = sorted(path for path in knowledge_root.glob("*.md") if path.is_file())
    if not files:
        raise RuntimeError(f"No knowledge files found in {knowledge_root}.")
    return files


def knowledge_fingerprint(repository_root: Path, files: list[Path]) -> str:
    digest = hashlib.sha256()
    for path in files:
        digest.update(path.relative_to(repository_root).as_posix().encode("utf-8"))
        digest.update(b"\0")
        digest.update(path.read_bytes())
        digest.update(b"\0")
    return digest.hexdigest()


def ensure_file_search_knowledge(
    project: Any,
    repository_root: Path,
    agent_name: str,
    agent_kind: str = "lakehouse",
) -> tuple[FileSearchTool, dict]:
    files = discover_knowledge_files(repository_root, agent_kind)
    fingerprint = knowledge_fingerprint(repository_root, files)
    store_name = f"{agent_name}-knowledge-{fingerprint[:12]}"
    relative_files = [path.relative_to(repository_root).as_posix() for path in files]

    with project.get_openai_client() as openai:
        matches = [store for store in openai.vector_stores.list(limit=100) if store.name == store_name]
        if len(matches) > 1:
            raise RuntimeError(f"Multiple vector stores are named '{store_name}'.")

        vector_store = matches[0] if matches else None
        if vector_store:
            indexed_files = list(openai.vector_stores.files.list(vector_store.id, limit=100))
            indexed_paths = {
                item.attributes.get("source_path")
                for item in indexed_files
                if item.status == "completed" and item.attributes
            }
            if indexed_paths != set(relative_files):
                openai.vector_stores.delete(vector_store.id)
                for item in indexed_files:
                    openai.files.delete(item.id)
                vector_store = None

        if vector_store is None:
            vector_store = openai.vector_stores.create(
                name=store_name,
                metadata={"agent_name": agent_name, "knowledge_sha256": fingerprint},
            )
            uploaded_file_ids = []
            try:
                for path, relative_path in zip(files, relative_files, strict=True):
                    file_hash = hashlib.sha256(path.read_bytes()).hexdigest()
                    with path.open("rb") as file_handle:
                        uploaded = openai.vector_stores.files.upload_and_poll(
                            vector_store_id=vector_store.id,
                            file=file_handle,
                            attributes={"source_path": relative_path, "sha256": file_hash},
                        )
                    if uploaded.status != "completed":
                        raise RuntimeError(f"Knowledge file '{relative_path}' finished with status '{uploaded.status}'.")
                    uploaded_file_ids.append(uploaded.id)
            except Exception:
                openai.vector_stores.delete(vector_store.id)
                for file_id in uploaded_file_ids:
                    openai.files.delete(file_id)
                raise

    return FileSearchTool(vector_store_ids=[vector_store.id]), {
        "type": "file_search",
        "vectorStoreId": vector_store.id,
        "vectorStoreName": store_name,
        "sha256": fingerprint,
        "files": relative_files,
    }


def ensure_lakehouse_capabilities(
    project: Any,
    repository_root: Path,
    agent_name: str,
) -> tuple[list[Any], dict]:
    knowledge_tool, knowledge_source = ensure_file_search_knowledge(
        project,
        repository_root,
        agent_name,
    )
    code_interpreter = CodeInterpreterTool(container=AutoCodeInterpreterToolParam(file_ids=[]))
    return [knowledge_tool, code_interpreter], knowledge_source