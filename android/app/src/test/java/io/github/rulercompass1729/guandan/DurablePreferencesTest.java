package io.github.rulercompass1729.guandan;

import android.content.SharedPreferences;
import java.io.IOException;
import java.util.HashMap;
import java.util.Map;
import java.util.Set;
import org.junit.Test;
import static org.junit.Assert.*;

public class DurablePreferencesTest {
    /** Same failure ordering as Android: RAM changes before the disk result is known. */
    private static final class MemoryFirst implements SharedPreferences {
        Map<String,Object> memory = new HashMap<>(), disk = new HashMap<>(); int failures;
        @Override public Map<String,?> getAll() { return new HashMap<>(memory); }
        @Override public boolean contains(String k) { return memory.containsKey(k); }
        @Override public String getString(String k, String fallback) { return (String) memory.getOrDefault(k, fallback); }
        @Override public Set<String> getStringSet(String k, Set<String> fallback) { return fallback; }
        @Override public int getInt(String k, int fallback) { return (Integer) memory.getOrDefault(k, fallback); }
        @Override public long getLong(String k, long fallback) { return (Long) memory.getOrDefault(k, fallback); }
        @Override public float getFloat(String k, float fallback) { return (Float) memory.getOrDefault(k, fallback); }
        @Override public boolean getBoolean(String k, boolean fallback) { return (Boolean) memory.getOrDefault(k, fallback); }
        @Override public void registerOnSharedPreferenceChangeListener(OnSharedPreferenceChangeListener l) {}
        @Override public void unregisterOnSharedPreferenceChangeListener(OnSharedPreferenceChangeListener l) {}
        @Override public Editor edit() { return new Editor() {
            private final Map<String,Object> changes = new HashMap<>(); private boolean clear;
            @Override public Editor putString(String k, String v) { changes.put(k,v); return this; }
            @Override public Editor putStringSet(String k, Set<String> v) { changes.put(k,v); return this; }
            @Override public Editor putInt(String k, int v) { changes.put(k,v); return this; }
            @Override public Editor putLong(String k, long v) { changes.put(k,v); return this; }
            @Override public Editor putFloat(String k, float v) { changes.put(k,v); return this; }
            @Override public Editor putBoolean(String k, boolean v) { changes.put(k,v); return this; }
            @Override public Editor remove(String k) { changes.put(k,null); return this; }
            @Override public Editor clear() { clear = true; return this; }
            @Override public void apply() { throw new AssertionError("durability requires commit"); }
            @Override public boolean commit() {
                if (clear) memory.clear();
                for (Map.Entry<String,Object> e : changes.entrySet()) { if (e.getValue() == null) memory.remove(e.getKey()); else memory.put(e.getKey(),e.getValue()); }
                if (failures > 0) { failures--; return false; }
                disk = new HashMap<>(memory); return true;
            }
        }; }
    }
    @Test public void failedActionCannotReappearOnRetryOrLaterSuccessfulWrite() throws Exception {
        for (int failures : new int[] {1,2}) {
            MemoryFirst p = new MemoryFirst(); p.edit().putString("token","old-token").putString("practiceState","old-state").commit();
            p.failures = failures;
            try { DurablePreferences.commit(p, p.edit().putString("pending","uncommitted-action").putString("token","new-token").putString("practiceState","new-state")); fail("write must fail"); }
            catch (IOException expected) { assertTrue(expected.getMessage().contains("未能保存")); }
            assertFalse(p.contains("pending")); assertEquals("old-token", p.getString("token", "")); assertEquals("old-state",p.getString("practiceState",""));
            DurablePreferences.commit(p,p.edit().putString("code","12345678"));
            assertFalse(p.disk.containsKey("pending")); assertEquals("old-token",p.disk.get("token")); assertEquals("old-state",p.disk.get("practiceState"));
        }
    }
    @Test public void failureWhileClearingAnAcceptedReceiptRetainsOriginalActionId() throws Exception {
        MemoryFirst p = new MemoryFirst(); DurablePreferences.commit(p,p.edit().putString("pending","same-action-id")); p.failures=2;
        try { DurablePreferences.commit(p,p.edit().remove("pending")); fail("write must fail"); } catch (IOException expected) {}
        assertEquals("same-action-id",p.getString("pending",""));
        DurablePreferences.commit(p,p.edit().putString("pending",p.getString("pending","")));
        assertEquals("same-action-id",p.disk.get("pending"));
    }
}
