import importlib.util
import json
from pathlib import Path
import socket
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('android_devices', ROOT / 'tools/android_devices.py')
devices = importlib.util.module_from_spec(spec)
spec.loader.exec_module(devices)

class OwnershipTests(unittest.TestCase):
    def record(self):
        return {'name': 'Guandan_A', 'serial': 'emulator-5554', 'pid': 12345, 'data_dir': str(devices.AVDS / 'Guandan_A.avd')}

    def test_foreign_name_or_disk_is_never_owned(self):
        item = self.record()
        command = f'{devices.SDK}/emulator/qemu/qemu-system-aarch64 -avd Guandan_A -datadir {item["data_dir"]}'
        self.assertFalse(devices.ownership_matches(item, 'unrelated_phone', command, []))
        self.assertFalse(devices.ownership_matches(item, 'Guandan_A', command.replace(item['data_dir'], '/tmp/unrelated-avd'), []))
        self.assertTrue(devices.ownership_matches(item, 'Guandan_A', command, []))

    def test_legacy_launch_needs_open_owned_disk(self):
        item = self.record()
        command = f'{devices.SDK}/emulator/qemu/qemu-system-aarch64 -avd Guandan_A'
        self.assertFalse(devices.ownership_matches(item, 'Guandan_A', command, []))
        self.assertTrue(devices.ownership_matches(item, 'Guandan_A', command, [item['data_dir'] + '/userdata-qemu.img.qcow2']))

    def test_an_occupied_port_is_refused(self):
        with socket.socket() as sock:
            sock.bind(('127.0.0.1', 0))
            with self.assertRaises(RuntimeError):
                devices.ensure_ports_available([sock.getsockname()[1]])

    def test_stop_never_signals_a_reused_or_foreign_serial(self):
        with tempfile.TemporaryDirectory(prefix='guandan-owner-') as temp:
            local = Path(temp)
            (local / 'devices.json').write_text(json.dumps([self.record()]))
            with patch.object(devices, 'LOCAL', local), patch.object(devices, 'check_owned', return_value=False), patch.object(devices.os, 'kill') as kill:
                with self.assertRaises(SystemExit):
                    devices.stop()
                kill.assert_not_called()
                self.assertTrue((local / 'devices.json').exists())

if __name__ == '__main__':
    unittest.main()
