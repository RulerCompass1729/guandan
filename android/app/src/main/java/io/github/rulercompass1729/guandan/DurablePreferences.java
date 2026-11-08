package io.github.rulercompass1729.guandan;

import android.content.SharedPreferences;
import java.io.IOException;
import java.util.HashSet;
import java.util.HashMap;
import java.util.Map;
import java.util.Set;

/** SharedPreferences mutates RAM even when commit fails; restore it before returning. */
final class DurablePreferences {
    private DurablePreferences() {}
    static void commit(SharedPreferences prefs, SharedPreferences.Editor editor) throws IOException {
        Map<String, ?> before = new HashMap<>(prefs.getAll());
        if (editor.commit()) return;
        SharedPreferences.Editor rollback = prefs.edit().clear();
        for (Map.Entry<String, ?> entry : before.entrySet()) {
            String key = entry.getKey(); Object value = entry.getValue();
            if (value instanceof String) rollback.putString(key, (String) value);
            else if (value instanceof Boolean) rollback.putBoolean(key, (Boolean) value);
            else if (value instanceof Integer) rollback.putInt(key, (Integer) value);
            else if (value instanceof Long) rollback.putLong(key, (Long) value);
            else if (value instanceof Float) rollback.putFloat(key, (Float) value);
            else if (value instanceof Set) {
                Set<String> strings = new HashSet<>();
                for (Object item : (Set<?>) value) strings.add((String) item);
                rollback.putStringSet(key, strings);
            }
        }
        // commitToMemory precedes the disk attempt even if this rollback cannot reach disk.
        rollback.commit();
        throw new IOException("手机未能保存这次操作，请检查存储空间后重试");
    }
}
