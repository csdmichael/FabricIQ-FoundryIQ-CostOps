import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from foundry_knowledge import ensure_file_search_knowledge, ensure_lakehouse_capabilities


class FakeVectorStoreFiles:
    def __init__(self, existing_files=None):
        self.uploads = []
        self.existing_files = existing_files or []

    def list(self, vector_store_id, limit):
        return self.existing_files

    def upload_and_poll(self, *, vector_store_id, file, attributes):
        self.uploads.append((vector_store_id, file.name, attributes))
        return SimpleNamespace(id=f"file-{len(self.uploads)}", status="completed")


class FakeVectorStores:
    def __init__(self, existing_store=None, existing_files=None):
        self.files = FakeVectorStoreFiles(existing_files)
        self.existing_store = existing_store
        self.created = []
        self.deleted = []

    def list(self, *, limit):
        return [self.existing_store] if self.existing_store else []

    def create(self, *, name, metadata):
        self.created.append((name, metadata))
        return SimpleNamespace(id="vs-knowledge", name=name)

    def delete(self, vector_store_id):
        self.deleted.append(vector_store_id)


class FakeOpenAI:
    def __init__(self, existing_store=None, existing_files=None):
        self.vector_stores = FakeVectorStores(existing_store, existing_files)
        self.deleted_files = []
        self.files = SimpleNamespace(delete=self.deleted_files.append)

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_value, traceback):
        return False


class FakeProject:
    def __init__(self, existing_store=None, existing_files=None):
        self.openai = FakeOpenAI(existing_store, existing_files)

    def get_openai_client(self):
        return self.openai


class FoundryKnowledgeTests(unittest.TestCase):
    def test_creates_hash_addressed_file_search_knowledge(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            knowledge = root / "agents" / "lakehouse" / "knowledge" / "files"
            knowledge.mkdir(parents=True)
            (knowledge / "guidance.md").write_text("governed guidance\n", encoding="utf-8")
            project = FakeProject()

            tool, metadata = ensure_file_search_knowledge(project, root, "lakehouse-agent")

            self.assertEqual(tool.vector_store_ids, ["vs-knowledge"])
            self.assertEqual(metadata["type"], "file_search")
            self.assertEqual(metadata["files"], ["agents/lakehouse/knowledge/files/guidance.md"])
            self.assertTrue(metadata["vectorStoreName"].startswith("lakehouse-agent-knowledge-"))
            self.assertEqual(len(project.openai.vector_stores.files.uploads), 1)

    def test_lakehouse_capabilities_include_file_search_and_code_interpreter(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            knowledge = root / "agents" / "lakehouse" / "knowledge" / "files"
            knowledge.mkdir(parents=True)
            (knowledge / "guidance.md").write_text("governed guidance\n", encoding="utf-8")

            tools, metadata = ensure_lakehouse_capabilities(FakeProject(), root, "lakehouse-agent")

            self.assertEqual([tool.type for tool in tools], ["file_search", "code_interpreter"])
            self.assertEqual(metadata["type"], "file_search")

    def test_reuses_complete_hash_addressed_store(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            knowledge = root / "agents" / "lakehouse" / "knowledge" / "files"
            knowledge.mkdir(parents=True)
            relative_path = "agents/lakehouse/knowledge/files/guidance.md"
            (knowledge / "guidance.md").write_text("governed guidance\n", encoding="utf-8")
            existing_store = SimpleNamespace(id="vs-existing", name="placeholder")
            existing_file = SimpleNamespace(id="file-existing", status="completed", attributes={"source_path": relative_path})
            project = FakeProject(existing_store, [existing_file])

            _, expected_metadata = ensure_file_search_knowledge(FakeProject(), root, "lakehouse-agent")
            existing_store.name = expected_metadata["vectorStoreName"]
            tool, metadata = ensure_file_search_knowledge(project, root, "lakehouse-agent")

            self.assertEqual(tool.vector_store_ids, ["vs-existing"])
            self.assertEqual(metadata["vectorStoreId"], "vs-existing")
            self.assertEqual(project.openai.vector_stores.created, [])
            self.assertEqual(project.openai.vector_stores.files.uploads, [])

    def test_repairs_incomplete_hash_addressed_store(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            knowledge = root / "agents" / "lakehouse" / "knowledge" / "files"
            knowledge.mkdir(parents=True)
            (knowledge / "guidance.md").write_text("governed guidance\n", encoding="utf-8")
            probe_project = FakeProject()
            _, expected_metadata = ensure_file_search_knowledge(probe_project, root, "lakehouse-agent")
            existing_store = SimpleNamespace(id="vs-incomplete", name=expected_metadata["vectorStoreName"])
            existing_file = SimpleNamespace(id="file-incomplete", status="failed", attributes={})
            project = FakeProject(existing_store, [existing_file])

            tool, _ = ensure_file_search_knowledge(project, root, "lakehouse-agent")

            self.assertEqual(tool.vector_store_ids, ["vs-knowledge"])
            self.assertEqual(project.openai.vector_stores.deleted, ["vs-incomplete"])
            self.assertEqual(project.openai.deleted_files, ["file-incomplete"])
            self.assertEqual(len(project.openai.vector_stores.files.uploads), 1)


if __name__ == "__main__":
    unittest.main()