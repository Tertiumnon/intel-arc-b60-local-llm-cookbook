import importlib.util
from io import BytesIO
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch


spec = importlib.util.spec_from_file_location("model_switch", Path(__file__).with_name("llama-model-switch.py"))
switch = importlib.util.module_from_spec(spec)
spec.loader.exec_module(switch)


class ModelSwitchTest(unittest.TestCase):
    def test_arc_lab_accepts_llama_health_response(self):
        responses = [BytesIO(b'{"data":[{"id":"arc-lab-qwen38"}]}'), BytesIO(b'{"status":"ok"}')]
        with patch.object(switch, "unit_state", return_value=True), patch.object(switch, "urlopen", side_effect=responses):
            self.assertEqual(switch.wait_service("arc-lab", "arc-lab-qwen38", 5), "arc-lab-qwen38")

    def test_arc_lab_switch_updates_server_context(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            unit = root / "arc-llm-lab.service"
            unit.write_text("ExecStart=llama-server -c 65536 --port 8080\n")
            for name in ("unsloth__Qwen3.8-27B-UD-Q4_K_M.gguf", "incoai__Qwen3.8-27B-DFlash2-Q4_K_M.gguf"):
                (root / name).touch()
            with patch.object(switch, "Path", return_value=root), patch.object(switch, "MODELS", root), patch.object(switch, "units", return_value=[unit.name]), patch.object(switch, "unit_state", return_value=True), patch.object(switch, "service"), patch.object(switch, "wait_service"), patch.object(switch, "install_unit", side_effect=lambda path, content: path.write_text(content)):
                switch.select("arc-lab", ["49152"])
                self.assertIn("-c 49152", unit.read_text())
                switch.select("arc-lab", [])
                self.assertIn("-c 65536", unit.read_text())

    def test_strata_accepts_context_variant_tag(self):
        self.assertIsNotNone(switch.TAG.fullmatch("coder-iq1_m-ctx57344"))
        self.assertIsNone(switch.TAG.fullmatch("coder-iq1_m-ctx12345"))


if __name__ == "__main__":
    unittest.main()
