package io.github.rulercompass1729.guandan;

import static org.junit.Assert.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.io.InputStream;
import java.io.ByteArrayOutputStream;
import com.google.gson.*;
import org.junit.Test;

public class PracticeEngineTest {
    private PracticeEngine engine() throws Exception {
        return new PracticeEngine(new String(Files.readAllBytes(Paths.get("src/main/assets/local-game.js")), StandardCharsets.UTF_8));
    }
    private static JsonObject object(Object... entries) {
        JsonObject value = new JsonObject();
        for (int i = 0; i < entries.length; i += 2) value.add((String) entries[i],
            entries[i + 1] instanceof JsonElement ? ((JsonElement) entries[i + 1]).deepCopy() : new GsonBuilder().serializeNulls().create().toJsonTree(entries[i + 1]));
        return value;
    }
    private static JsonObject request(PracticeEngine engine, JsonObject input) {
        JsonObject value = JsonParser.parseString(engine.request(input.toString())).getAsJsonObject();
        assertFalse(value.toString(), value.has("error")); return value;
    }
    @Test public void bundledAndroidRuntimeMatchesNodeReferenceFixtures() throws Exception {
        PracticeEngine engine = engine();
        try (InputStream stream = getClass().getResourceAsStream("/engine-fixtures.json")) {
            assertNotNull(stream); ByteArrayOutputStream data = new ByteArrayOutputStream();
            byte[] buffer = new byte[4096]; int count;
            while ((count = stream.read(buffer)) != -1) data.write(buffer, 0, count);
            JsonArray fixtures = JsonParser.parseString(new String(data.toByteArray(), StandardCharsets.UTF_8)).getAsJsonArray();
            for (int i = 0; i < fixtures.size(); i++) {
                JsonObject fixture = fixtures.get(i).getAsJsonObject();
                assertEquals("Node/Rhino fixture " + i, fixture.get("expected"), request(engine, fixture.getAsJsonObject("input")));
            }
        }
    }
    @Test public void practiceRoundCompletesAndStateReopensWithoutChangingAHand() throws Exception {
      for (String difficulty : new String[] { "easy", "standard", "advanced" }) {
        PracticeEngine engine = engine();
        JsonObject result = request(engine, object("op", "new", "testSeed", 1729, "name", "牌友甲", "difficulty", difficulty));
        for (int step = 0; step < 300 && !result.getAsJsonObject("state").get("stage").getAsString().equals("roundOver"); step++) {
            JsonObject state = result.getAsJsonObject("state");
            if (result.get("needsBot").getAsBoolean()) result = request(engine, object("op", "tick", "state", state));
            else {
                JsonObject hint = request(engine, object("op", "hint", "state", state, "cursor", 0));
                JsonObject action = object("type", hint.get("ids").isJsonNull() ? "pass" : "play", "ids", hint.get("ids"),
                    "patternId", hint.get("patternId"), "expectedVersion", state.get("version"),
                    "roundId", state.getAsJsonObject("game").get("roundId"), "actionId", "test-practice-action");
                result = request(engine, object("op", "action", "state", state, "action", action));
            }
        }
        assertEquals("roundOver", result.getAsJsonObject("state").get("stage").getAsString());
        JsonObject state = result.getAsJsonObject("state");
        JsonObject reopened = request(engine(), object("op", "view", "state", state));
        assertEquals(result.get("view"), reopened.get("view"));
        assertEquals(difficulty, reopened.getAsJsonObject("view").get("difficulty").getAsString());
        JsonObject changed = request(engine, object("op", "action", "state", state, "action",
            object("type", "difficulty", "difficulty", "advanced", "expectedVersion", state.get("version"))));
        state = changed.getAsJsonObject("state");
        JsonObject next = request(engine, object("op", "action", "state", state, "action",
            object("type", "next", "expectedVersion", state.get("version"), "actionId", "next-practice-action")));
        assertEquals(2, next.getAsJsonObject("view").get("round").getAsInt());
        assertEquals("advanced", next.getAsJsonObject("view").get("difficulty").getAsString());
      }
    }
}
