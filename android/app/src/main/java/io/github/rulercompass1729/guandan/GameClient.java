package io.github.rulercompass1729.guandan;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.Handler;
import android.os.Looper;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URI;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.UUID;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
import java.util.function.Consumer;
import org.java_websocket.client.WebSocketClient;
import org.java_websocket.handshake.ServerHandshake;
import org.json.JSONArray;
import org.json.JSONObject;

/** Native transport and durable seat state; all mutation runs on one owned executor. */
public final class GameClient {
    public interface Listener { void onChanged(); }
    private final Context context;
    private final SharedPreferences prefs;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ScheduledExecutorService executor = Executors.newSingleThreadScheduledExecutor();
    private final Listener listener;
    private final SecureRandom random = new SecureRandom();
    private volatile boolean active, closed, connected, busy, practice;
    private volatile JSONObject view;
    private volatile String message = "";
    private volatile boolean pending;
    private volatile WebSocketClient socket;
    private ScheduledFuture<?> reconnectTask, practiceTask;
    private PracticeEngine engine;
    private String localState;
    private int reconnectCount;

    public GameClient(Context context, Listener listener) {
        this.context = context.getApplicationContext(); this.listener = listener;
        prefs = this.context.getSharedPreferences("seat", Context.MODE_PRIVATE);
    }
    public JSONObject view() { return view; }
    public boolean connected() { return connected; }
    public boolean busy() { return busy; }
    public boolean practice() { return practice; }
    public boolean pending() { return pending; }
    public String message() { return message; }
    public String server() { return prefs.getString("server", BuildConfig.SERVER_URL); }
    public String name() { return prefs.getString("name", ""); }
    private void notifyChanged() { if (!closed) main.post(() -> { if (!closed) listener.onChanged(); }); }
    private void tell(String value) { message = value; notifyChanged(); }
    private void persist(SharedPreferences.Editor editor) throws IOException {
        DurablePreferences.commit(prefs, editor);
    }
    private static JSONObject parse(String text) throws Exception { return new JSONObject(text); }
    private static String read(InputStream in) throws IOException {
        try (InputStream stream = in; ByteArrayOutputStream data = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[4096]; int count;
            while ((count = stream.read(buffer)) != -1) {
                if (data.size() + count > 524288) throw new IOException("牌桌返回的信息过大，请稍后重试");
                data.write(buffer, 0, count);
            }
            return new String(data.toByteArray(), StandardCharsets.UTF_8);
        }
    }
    public void saveServer(String value, Consumer<String> result) {
        executor.execute(() -> {
            try {
                if (view != null) throw new IOException("请先离开当前牌桌，再更换联机服务");
                URI uri = new URI(value.trim());
                String scheme = uri.getScheme(), host = uri.getHost();
                boolean loopback = "10.0.2.2".equals(host) || "127.0.0.1".equals(host) || "localhost".equals(host);
                if (host == null || uri.getRawUserInfo() != null || uri.getRawQuery() != null || uri.getRawFragment() != null ||
                    !(uri.getRawPath().isEmpty() || uri.getRawPath().equals("/")) ||
                    !("https".equals(scheme) || "http".equals(scheme) && loopback)) throw new IOException("请输入组织者提供的HTTPS服务地址");
                String normalized = new URI(scheme, null, host, uri.getPort(), null, null, null).toString();
                persist(prefs.edit().putString("server", normalized)); main.post(() -> result.accept(null));
            } catch (Exception e) { main.post(() -> result.accept(e.getMessage())); }
        });
    }
    public void activate() {
        active = true;
        executor.execute(() -> {
            try {
                practice = "practice".equals(prefs.getString("mode", ""));
                if (practice && prefs.contains("practiceState")) {
                    localState = prefs.getString("practiceState", "");
                    applyPractice(localRequest("view", null), false); return;
                }
                String token = prefs.getString("token", "");
                if (!token.isEmpty() && !server().isEmpty()) {
                    String cached = prefs.getString("cachedView", "");
                    if (view == null && !cached.isEmpty()) view = parse(cached);
                    pending = !prefs.getString("pending", "").isEmpty();
                    connected = false;
                    busy = true; tell("正在回到原牌桌");
                    accept(api("/api/session", null).getJSONObject("view")); message = ""; connect();
                }
            } catch (ApiFailure e) { handle(e); }
            catch (Exception e) { tell(pending ? "暂时连不上，牌桌和操作已保留。请点重试这次操作" : "暂时连不上牌桌，座位已保留。可点重新连接"); }
            finally { busy = false; notifyChanged(); }
        });
    }
    public void deactivate() {
        active = false; connected = false;
        executor.execute(() -> {
            cancelTimers(); WebSocketClient old = socket; socket = null;
            if (old != null) old.close();
        });
    }
    public void close() {
        active = false; closed = true; connected = false;
        executor.execute(() -> { cancelTimers(); if (socket != null) socket.close(); socket = null; });
        executor.shutdown();
    }
    private void cancelTimers() {
        if (reconnectTask != null) reconnectTask.cancel(false);
        if (practiceTask != null) practiceTask.cancel(false);
        reconnectTask = null; practiceTask = null;
    }
    private String ensureToken() throws Exception {
        String value = prefs.getString("token", "");
        if (!value.isEmpty()) { persist(prefs.edit().putString("token", value)); return value; }
        byte[] bytes = new byte[32]; random.nextBytes(bytes); StringBuilder token = new StringBuilder();
        for (byte b : bytes) token.append(String.format(java.util.Locale.ROOT, "%02x", b & 255));
        persist(prefs.edit().putString("token", token.toString()).putString("mode", "online"));
        return token.toString();
    }
    public void join(boolean create, String code, String nickname) {
        if (busy) return;
        busy = true; message = ""; notifyChanged();
        executor.execute(() -> {
            try {
                if (server().isEmpty()) throw new IOException("亲友联机尚未设置服务地址。可先和电脑练习");
                if (!create && !code.matches("[0-9]{8}")) throw new IOException("请输入8位牌桌号");
                practice = false; ensureToken(); persist(prefs.edit().putString("name", nickname));
                accept(api(create ? "/api/rooms" : "/api/rooms/" + code + "/join", new JSONObject().put("name", nickname)).getJSONObject("view"));
                connect();
            } catch (ApiFailure e) { handle(e); }
            catch (Exception e) { tell(e.getMessage() == null ? "暂时连不上牌桌，请稍后重试" : e.getMessage()); }
            finally { busy = false; notifyChanged(); }
        });
    }
    public void startPractice(String nickname, String difficulty) {
        if (busy) return;
        busy = true; notifyChanged();
        executor.execute(() -> {
            try {
                JSONObject input = new JSONObject().put("op", "new").put("name", nickname).put("difficulty", difficulty);
                JSONObject response = localEngine(input);
                String serialized = response.getJSONObject("state").toString();
                persist(prefs.edit().putString("mode", "practice").putString("name", nickname).putString("practiceState", serialized).remove("pending"));
                localState = serialized; practice = true; pending = false; message = "";
                applyPractice(response, false);
            } catch (Exception e) { tell("练习未能开始：" + e.getMessage()); }
            finally { busy = false; notifyChanged(); }
        });
    }
    private JSONObject localEngine(JSONObject input) throws Exception {
        if (engine == null) engine = new PracticeEngine(read(context.getAssets().open("local-game.js")));
        JSONObject response = parse(engine.request(input.toString()));
        if (response.has("error")) throw new IOException(response.getString("error"));
        return response;
    }
    private JSONObject localRequest(String op, JSONObject extra) throws Exception {
        JSONObject input = extra == null ? new JSONObject() : parse(extra.toString());
        input.put("op", op).put("state", parse(localState)); return localEngine(input);
    }
    private void applyPractice(JSONObject response, boolean save) throws Exception {
        String next = response.getJSONObject("state").toString();
        if (save) persist(prefs.edit().putString("practiceState", next));
        localState = next; view = response.getJSONObject("view"); connected = true; message = ""; notifyChanged();
        if (practiceTask != null) practiceTask.cancel(false);
        if (active && response.optBoolean("needsBot")) practiceTask = executor.schedule(() -> {
            try { if (active && practice) applyPractice(localRequest("tick", null), true); }
            catch (Exception e) { tell("练习进度未保存，这手没有提交：" + e.getMessage()); }
        }, 750, TimeUnit.MILLISECONDS);
    }
    public void submit(String type, JSONObject fields) {
        JSONObject snapshot = view;
        if (snapshot == null || busy || pending || !connected) return;
        busy = true; message = ""; notifyChanged();
        executor.execute(() -> {
            try {
                if (practice && "leave".equals(type)) { clearSeat(); return; }
                JSONObject action = fields == null ? new JSONObject() : parse(fields.toString());
                action.put("type", type).put("actionId", UUID.randomUUID().toString()).put("expectedVersion", snapshot.getInt("version"))
                    .put("roundId", snapshot.opt("roundId"));
                if (practice) applyPractice(localRequest("action", new JSONObject().put("action", action)), true);
                else {
                    persist(prefs.edit().putString("pending", action.toString())); pending = true;
                    resolvePending();
                }
            } catch (ApiFailure e) { handle(e); }
            catch (Exception e) { tell(pending ? "确认尚未收到，操作已保留。可重试这次操作" : "这次操作没有提交：" + e.getMessage()); }
            finally { busy = false; notifyChanged(); }
        });
    }
    private void resolvePending() throws Exception {
        String serialized = prefs.getString("pending", "");
        if (serialized.isEmpty()) { pending = false; return; }
        persist(prefs.edit().putString("pending", serialized)); pending = true;
        JSONObject action = parse(serialized), response;
        try { response = api("/api/rooms/" + prefs.getString("code", "") + "/action", action); }
        catch (ApiFailure e) {
            if (!"STALE".equals(e.code) || e.state == null || !stillActionable(action, e.state)) {
                persist(prefs.edit().remove("pending")); pending = false; throw e;
            }
            accept(e.state); action.put("expectedVersion", e.state.getInt("version"));
            persist(prefs.edit().putString("pending", action.toString()));
            response = api("/api/rooms/" + prefs.getString("code", "") + "/action", action);
        }
        persist(prefs.edit().remove("pending")); pending = false; message = "";
        JSONObject next = response.optJSONObject("view");
        if (next == null) clearSeat(); else accept(next);
    }
    private boolean stillActionable(JSONObject action, JSONObject state) throws Exception {
        String type = action.getString("type"), stage = state.getString("stage");
        if ("play".equals(type) || "pass".equals(type)) {
            if (!"playing".equals(stage) || !state.optString("roundId").equals(action.optString("roundId")) || state.getInt("turn") != state.getInt("self") ||
                state.getJSONArray("seats").getJSONObject(state.getInt("self")).optBoolean("auto")) return false;
            JSONArray ids = action.optJSONArray("ids"), hand = state.getJSONArray("hand");
            if (ids != null) for (int i = 0; i < ids.length(); i++) {
                boolean found = false; for (int j = 0; j < hand.length(); j++) if (hand.getJSONObject(j).getInt("id") == ids.getInt(i)) found = true;
                if (!found) return false;
            }
            return true;
        }
        if ("return".equals(type)) {
            JSONArray ids = action.optJSONArray("ids"), allowed = state.getJSONArray("returnIds");
            if (!"tribute".equals(stage) || ids == null || ids.length() != 1 || !state.optString("roundId").equals(action.optString("roundId"))) return false;
            for (int i = 0; i < allowed.length(); i++) if (allowed.getInt(i) == ids.getInt(0)) return true;
            return false;
        }
        if ("next".equals(type)) return "roundOver".equals(stage);
        if ("restart".equals(type)) return "matchOver".equals(stage);
        if ("start".equals(type) || "switch".equals(type)) return "waiting".equals(stage);
        return true;
    }
    public void hint(int cursor, Consumer<JSONObject> callback) { query("hint", new JSONObject(), cursor, callback); }
    public void preview(JSONArray ids, Consumer<JSONObject> callback) {
        try { query("preview", new JSONObject().put("ids", ids), 0, callback); } catch (Exception e) { tell("请选择手牌"); }
    }
    private void query(String kind, JSONObject input, int cursor, Consumer<JSONObject> callback) {
        JSONObject snapshot = view; if (snapshot == null) return;
        executor.execute(() -> {
            try {
                input.put("cursor", cursor);
                JSONObject result = practice ? localRequest(kind, input) : api("/api/rooms/" + snapshot.getString("code") + "/" + kind, input);
                if (view != null && view.optInt("version") == snapshot.optInt("version")) main.post(() -> { if (!closed) callback.accept(result); });
            } catch (ApiFailure e) { handle(e); }
            catch (Exception e) { tell("提示暂时没取到，请稍后再试"); }
        });
    }
    public void retry() {
        if (busy) return; busy = true; notifyChanged();
        executor.execute(() -> {
            try {
                if (practice) applyPractice(localRequest("view", null), false);
                else if (prefs.contains("pending")) { resolvePending(); if (view != null && !connected) connect(); }
                else { accept(api("/api/session", null).getJSONObject("view")); connect(); }
            } catch (ApiFailure e) { handle(e); }
            catch (Exception e) { tell("暂时连不上牌桌，已保留座位和操作"); }
            finally { busy = false; notifyChanged(); }
        });
    }
    private void accept(JSONObject incoming) throws Exception {
        JSONObject current = view;
        if (current != null && current.optString("code").equals(incoming.optString("code")) && incoming.getInt("version") < current.getInt("version")) return;
        String code = incoming.getString("code");
        if (!code.matches("[0-9]{8}") || incoming.getInt("self") < 0 || incoming.getInt("self") > 3) throw new IOException("牌桌返回的信息不完整");
        persist(prefs.edit().putString("code", code).putString("cachedView", incoming.toString()).putString("mode", "online"));
        view = incoming; pending = prefs.contains("pending"); notifyChanged();
    }
    private void connect() throws Exception {
        if (!active || practice || closed) return;
        if (reconnectTask != null) reconnectTask.cancel(false);
        WebSocketClient old = socket; socket = null; if (old != null) old.close();
        connected = false; notifyChanged();
        URI uri = new URI(server().replaceFirst("^http", "ws") + "/ws");
        WebSocketClient next = new WebSocketClient(uri) {
            @Override public void onOpen(ServerHandshake handshake) {
                if (closed || !active || socket != this) { close(); return; }
                try { send(new JSONObject().put("type", "authenticate").put("room", prefs.getString("code", "")).put("token", prefs.getString("token", "")).toString()); }
                catch (Exception e) { close(); }
            }
            @Override public void onMessage(String text) {
                if (closed) return;
                executor.execute(() -> {
                    if (socket != this || !active || practice) return;
                    try {
                        JSONObject event = parse(text); if (!"state".equals(event.optString("type"))) return;
                        connected = true; reconnectCount = 0; if (!prefs.contains("pending")) message = "";
                        accept(event.getJSONObject("view"));
                        if (prefs.contains("pending") && !busy) {
                            busy = true; try { resolvePending(); }
                            catch (ApiFailure e) { handle(e); }
                            catch (Exception e) { tell("确认尚未收到，可重试这次操作"); }
                            finally { busy = false; notifyChanged(); }
                        }
                    } catch (Exception e) { tell("牌桌信息不完整，正在重新连接"); close(); }
                });
            }
            @Override public void onClose(int code, String reason, boolean remote) {
                if (closed) return;
                executor.execute(() -> {
                    if (socket != this) return;
                    connected = false;
                    if (code == 4001) { tell("座位已在另一窗口打开。要在这里继续，请点重新连接"); return; }
                    if (code == 4002) { try { clearSeat(); } catch (Exception e) { tell("请重新加入牌桌"); } return; }
                    reconnectLater();
                });
            }
            @Override public void onError(Exception e) { /* onClose owns reconnect scheduling. */ }
        };
        next.setConnectionLostTimeout(20); socket = next; next.connect();
    }
    private void reconnectLater() {
        if (!active || closed || practice) return;
        tell("正在连接，座位已保留");
        if (reconnectTask != null) reconnectTask.cancel(false);
        reconnectTask = executor.schedule(() -> {
            try { connect(); } catch (Exception e) { reconnectLater(); }
        }, Math.min(5000, 500L << Math.min(4, reconnectCount++)), TimeUnit.MILLISECONDS);
    }
    private void clearSeat() throws Exception {
        cancelTimers(); WebSocketClient old = socket; socket = null; if (old != null) old.close();
        persist(prefs.edit().remove("mode").remove("code").remove("token").remove("pending").remove("cachedView").remove("practiceState"));
        view = null; pending = false; connected = false; practice = false; localState = null; message = ""; notifyChanged();
    }
    private void handle(ApiFailure failure) {
        try {
            if ("AUTH".equals(failure.code)) clearSeat();
            else if (failure.state != null) accept(failure.state);
        } catch (Exception ignored) { /* Preserve the original explanation. */ }
        tell(failure.getMessage());
    }
    private JSONObject api(String path, JSONObject input) throws Exception {
        String endpoint = server(); if (endpoint.isEmpty()) throw new IOException("尚未设置联机服务");
        HttpURLConnection connection = (HttpURLConnection) new URL(endpoint + path).openConnection();
        connection.setInstanceFollowRedirects(false); connection.setConnectTimeout(10000); connection.setReadTimeout(10000); connection.setUseCaches(false);
        connection.setRequestProperty("Authorization", "Bearer " + prefs.getString("token", ""));
        connection.setRequestProperty("Accept", "application/json");
        try {
            if (input != null) {
                connection.setRequestMethod("POST"); connection.setDoOutput(true); connection.setRequestProperty("Content-Type", "application/json; charset=utf-8");
                try (OutputStream out = connection.getOutputStream()) { out.write(input.toString().getBytes(StandardCharsets.UTF_8)); }
            }
            int status = connection.getResponseCode();
            InputStream body = status >= 200 && status < 300 ? connection.getInputStream() : connection.getErrorStream();
            if (body == null) throw new IOException("牌桌暂时没有响应");
            JSONObject data = parse(read(body));
            if (status < 200 || status >= 300) throw new ApiFailure(data.optString("code", "SERVER"), data.optString("error", "这次未能处理，请重试"), data.optJSONObject("view"));
            return data;
        } catch (ApiFailure e) { throw e; }
        catch (IOException e) { throw new IOException("暂时连不上牌桌，请检查网络后重试", e); }
        finally { connection.disconnect(); }
    }
    private static final class ApiFailure extends Exception {
        final String code; final JSONObject state;
        ApiFailure(String code, String message, JSONObject state) { super(message); this.code = code; this.state = state; }
    }
}
