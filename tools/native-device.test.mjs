import test from 'node:test';
import assert from 'node:assert/strict';
import { NativeDevice, PACKAGE } from './native-device.mjs';

test('native hierarchy decodes XML numeric newlines before exact label matching', async () => {
  const device = new NativeDevice(0, '.');
  // Reduced from a real UIAutomator dump of the installed difficulty picker.
  device.command = async () => `<hierarchy><android.widget.FrameLayout bounds="[0,0][1080,2340]">
    <android.widget.CheckedTextView package="${PACKAGE}" resource-id="android:id/text1"
      text="轻松&#10;优先简单出牌，适合熟悉操作" bounds="[71,944][1009,1088]"/>
    <android.widget.TextView resource-id="${PACKAGE}:id/status" text="&amp;#10; &quot;牌友&quot; &#x4F60;" bounds="[0,0][500,100]"/>
    </android.widget.FrameLayout></hierarchy>`;
  const result = await device.observe();
  assert.equal(result.nodes[1].text, '轻松\n优先简单出牌，适合熟悉操作');
  assert.equal(result.byId.status.text, '&#10; "牌友" 你', 'decode only one XML layer');
});
