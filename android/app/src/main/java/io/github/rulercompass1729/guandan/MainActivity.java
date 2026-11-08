package io.github.rulercompass1729.guandan;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.res.Configuration;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Bundle;
import android.text.InputFilter;
import android.text.InputType;
import android.text.TextUtils;
import android.util.TypedValue;
import android.view.ContextThemeWrapper;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.view.inputmethod.InputMethodManager;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.json.JSONArray;
import org.json.JSONObject;

/** Native Android widgets. No browser, WebView or HTML rendering is used. */
public final class MainActivity extends Activity {
    private static final int INK = Color.rgb(23, 39, 31), PAPER = Color.rgb(249, 245, 233),
        GOLD = Color.rgb(215, 187, 126), TEXT = Color.rgb(239, 235, 218), MUTED = Color.rgb(180, 197, 172),
        RED = Color.rgb(180, 43, 53), DARK = Color.rgb(15, 39, 31);
    private GameClient client;
    private SharedPreferences display;
    private final Set<Integer> selected = new LinkedHashSet<>();
    private JSONArray patterns = new JSONArray();
    private String chosen = "", selectionMessage = "", activityMessage = "", lastRound = "", lastStage = "";
    private int lastVersion = -1, lastSelf = -1, hintCursor, previewGeneration;
    private boolean compact;
    private AlertDialog groupDialog;
    private AlertDialog patternDialog;
    private boolean groupCommitted;
    private Set<Integer> groupBefore;
    private List<JSONObject> groupCards;
    private EditText nickname, joinCode;
    private boolean landscape;
    private int widthDp;
    private static final String[] DIFFICULTIES = { "easy", "standard", "advanced" };
    private static final String[] DIFFICULTY_NAMES = { "轻松", "标准", "进阶" };
    private int difficultyIndex(String value) { for (int i = 0; i < DIFFICULTIES.length; i++) if (DIFFICULTIES[i].equals(value)) return i; return 1; }
    private String practiceDifficulty() { return DIFFICULTIES[difficultyIndex(display.getString("difficulty", "standard"))]; }
    private String difficultyName(JSONObject view) { return DIFFICULTY_NAMES[difficultyIndex(view.optString("difficulty", "standard"))]; }
    private int cardHeight() { return Math.max(70, Math.round(48 * getResources().getConfiguration().fontScale + 10)); }

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        display = getSharedPreferences("display", MODE_PRIVATE);
        compact = display.getBoolean("compact", false);
        client = new GameClient(this, this::changed);
        render();
    }
    @Override protected void onStart() { super.onStart(); immersive(); client.activate(); }
    @Override protected void onStop() { client.deactivate(); super.onStop(); }
    @Override protected void onDestroy() { closeGroup(true); closePattern(); client.close(); super.onDestroy(); }
    @Override public void onConfigurationChanged(Configuration configuration) { super.onConfigurationChanged(configuration); immersive(); render(); }
    @Override public void onWindowFocusChanged(boolean focused) { super.onWindowFocusChanged(focused); if (focused) immersive(); }
    private void immersive() {
        if (Build.VERSION.SDK_INT >= 30) {
            getWindow().setDecorFitsSystemWindows(false);
            WindowInsetsController controller = getWindow().getInsetsController();
            if (controller != null) { controller.hide(WindowInsets.Type.systemBars()); controller.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE); }
        } else getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION |
            View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
    }
    private int dp(float value) { return Math.round(value * getResources().getDisplayMetrics().density); }
    private boolean canSubmit() { return client.connected() && !client.busy() && !client.pending(); }
    private int id(String name) { return getResources().getIdentifier(name, "id", getPackageName()); }
    private GradientDrawable surface(int color, int radius, int stroke) {
        GradientDrawable value = new GradientDrawable(); value.setColor(color); value.setCornerRadius(dp(radius));
        if (stroke != 0) value.setStroke(dp(1), stroke); return value;
    }
    private TextView text(String value, float size, int color) {
        TextView label = new TextView(this); label.setText(value); label.setTextSize(TypedValue.COMPLEX_UNIT_SP, size);
        label.setTextColor(color); label.setIncludeFontPadding(false); label.setMaxLines(2); label.setEllipsize(TextUtils.TruncateAt.END);
        return label;
    }
    private LinearLayout column() { LinearLayout value = new LinearLayout(this); value.setOrientation(LinearLayout.VERTICAL); return value; }
    private LinearLayout row() { LinearLayout value = new LinearLayout(this); value.setOrientation(LinearLayout.HORIZONTAL); value.setGravity(Gravity.CENTER_VERTICAL); return value; }
    private Button button(String label, String name, boolean primary, Runnable action) {
        Button value = new Button(this); value.setText(label); value.setAllCaps(false); value.setTextSize(17);
        value.setTextColor(primary ? INK : TEXT); value.setMinHeight(dp(48)); value.setMinimumHeight(dp(48));
        value.setPadding(dp(12), dp(4), dp(12), dp(4)); value.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        value.setBackground(surface(primary ? GOLD : Color.rgb(32, 60, 44), 5, primary ? Color.rgb(228, 207, 157) : Color.rgb(92, 116, 91)));
        if (name != null) value.setId(id(name));
        value.setOnClickListener(v -> { activityMessage = ""; action.run(); }); return value;
    }
    private void addButton(LinearLayout parent, Button value, int width) {
        LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(width == 0 ? 0 : dp(width), dp(48), width == 0 ? 1 : 0);
        p.setMargins(dp(4), 0, dp(4), 0); parent.addView(value, p);
    }
    private void hideKeyboard() { ((InputMethodManager) getSystemService(INPUT_METHOD_SERVICE)).hideSoftInputFromWindow(getWindow().getDecorView().getWindowToken(), 0); }
    private JSONObject fields(Object... entries) {
        JSONObject result = new JSONObject();
        try { for (int i = 0; i < entries.length; i += 2) result.put((String) entries[i], entries[i + 1]); }
        catch (Exception e) { throw new IllegalArgumentException(e); } return result;
    }
    private JSONArray selectedIds() { return new JSONArray(new ArrayList<>(selected)); }
    private String selectedKey() { List<Integer> ids = new ArrayList<>(selected); Collections.sort(ids); return ids.toString(); }
    private Set<Integer> available(JSONObject v) {
        Set<Integer> result = new LinkedHashSet<>(); JSONArray hand = v == null ? new JSONArray() : v.optJSONArray("hand");
        if (hand != null) for (int i = 0; i < hand.length(); i++) { JSONObject c = hand.optJSONObject(i); if (c != null) result.add(c.optInt("id", -1)); }
        return result;
    }
    private void changed() {
        JSONObject v = client.view();
        if (v == null) { closeGroup(true); closePattern(); selected.clear(); patterns = new JSONArray(); chosen = ""; lastVersion = -1; }
        else {
            boolean roundChanged = !lastRound.equals(v.optString("roundId")) || lastSelf != v.optInt("self");
            if (roundChanged || !lastStage.equals(v.optString("stage"))) closeGroup(true);
            if (roundChanged) { selected.clear(); hintCursor = 0; selectionMessage = ""; }
            selected.retainAll(available(v));
            if (groupCards != null) for (JSONObject card : groupCards) if (!available(v).contains(card.optInt("id"))) { closeGroup(true); break; }
            boolean newVersion = lastVersion != v.optInt("version");
            lastRound = v.optString("roundId"); lastSelf = v.optInt("self"); lastStage = v.optString("stage"); lastVersion = v.optInt("version");
            if (newVersion) { closePattern(); patterns = new JSONArray(); chosen = ""; activityMessage = ""; if (!selected.isEmpty()) requestPreview(); }
        }
        render();
    }
    private void render() {
        landscape = getResources().getConfiguration().orientation == Configuration.ORIENTATION_LANDSCAPE;
        widthDp = Math.round(getResources().getDisplayMetrics().widthPixels / getResources().getDisplayMetrics().density);
        try {
            if (client.view() == null) { renderHome(); return; }
            JSONObject v = client.view();
            ScrollView scroll = new ScrollView(this); scroll.setFillViewport(true); scroll.setBackgroundColor(DARK);
            LinearLayout page = column(); page.setId(R.id.app_root); page.setPadding(0, 0, 0, dp(4));
            page.setBackground(new GradientDrawable(GradientDrawable.Orientation.TL_BR, new int[] { Color.rgb(34, 81, 64), Color.rgb(12, 47, 36) }));
            scroll.addView(page);
            LinearLayout shell = column(); shell.setBackgroundColor(DARK); shell.addView(scroll, new LinearLayout.LayoutParams(-1, 0, 1)); setContentView(shell);
            page.addView(header(v), new LinearLayout.LayoutParams(-1, dp(48)));
            String message = !activityMessage.isEmpty() ? activityMessage : client.message();
            if (!message.isEmpty()) page.addView(status(message));
            if (!client.connected() && !client.pending()) {
                Button reconnect = button("重新连接原牌桌", "reconnect", false, client::retry); reconnect.setEnabled(!client.busy());
                page.addView(reconnect, new LinearLayout.LayoutParams(-1, dp(48)));
            }
            if (client.pending()) { Button retry = button("重试这次操作", "retry_action", true, client::retry); retry.setEnabled(!client.busy()); shell.addView(retry, new LinearLayout.LayoutParams(-1, dp(48))); }
            String stage = v.getString("stage");
            if ("waiting".equals(stage)) { waiting(page, v); return; }
            if ("roundOver".equals(stage) || "matchOver".equals(stage)) { result(page, v); return; }
            page.addView(board(v), new LinearLayout.LayoutParams(-1, dp(landscape ? Math.max(80, Math.round(55 * getResources().getConfiguration().fontScale + 25)) : 160)));
            int self = v.getInt("self"); boolean auto = v.getJSONArray("seats").getJSONObject(self).optBoolean("auto");
            if (auto) {
                Button resume = button("电脑正在代打 · 点这里接回", "resume_big", true, () -> client.submit("resume", null));
                resume.setEnabled(canSubmit()); page.addView(resume, new LinearLayout.LayoutParams(-1, dp(48)));
            }
            page.addView(hand(v)); page.addView(selection(v), new LinearLayout.LayoutParams(-1, dp(48)));
            LinearLayout controls = row(); controls.setId(R.id.bottom_controls); controls.setGravity(Gravity.CENTER); controls.setBackgroundColor(DARK);
            boolean returning = "tribute".equals(stage), own = returning ? v.getJSONArray("returnIds").length() > 0 : v.getInt("turn") == self;
            boolean can = own && !auto && canSubmit();
            Button hint = button("提示", "hint", false, this::hint); hint.setEnabled(can); addButton(controls, hint, 100);
            Button pass = button("不要", "pass", false, () -> client.submit("pass", null));
            pass.setEnabled(can && !returning && !v.isNull("last")); addButton(controls, pass, 100);
            boolean valid = returning ? selected.size() == 1 && contains(v.optJSONArray("returnIds"), selected.iterator().next()) : patterns.length() > 0 && !chosen.isEmpty();
            Button play = button(returning ? "确认还牌" : "确认出牌", "play", true,
                () -> client.submit(returning ? "return" : "play", fields("ids", selectedIds(), "patternId", chosen)));
            play.setEnabled(can && valid); addButton(controls, play, 172);
            shell.addView(controls, 1, new LinearLayout.LayoutParams(-1, dp(56)));
        } catch (Exception e) { activityMessage = "牌桌信息暂时不完整，请重新连接"; }
    }
    private TextView status(String value) { TextView label = text(value, 15, GOLD); label.setId(R.id.status); label.setPadding(dp(14), dp(6), dp(14), dp(6)); return label; }
    private LinearLayout header(JSONObject v) {
        LinearLayout header = row(); header.setPadding(dp(8), 0, dp(8), 0); header.setBackgroundColor(DARK);
        TextView level = text("打 " + rank(v.optInt("level", 2)) + "  ·  第" + v.optInt("round") + "副", 15, GOLD); level.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        header.addView(level, new LinearLayout.LayoutParams(0, -2, 1));
        TextView code = text(v.optString("code"), 13, MUTED); code.setId(R.id.header_code); header.addView(code, new LinearLayout.LayoutParams(0, -2, 1));
        Button mode = button(compact ? "大字" : "紧凑", "mode_toggle", false, () -> {
            closeGroup(false); compact = !compact; display.edit().putBoolean("compact", compact).commit(); render();
        }); mode.setTextSize(13); mode.setContentDescription(compact ? "当前紧凑排列，切换大字" : "当前大字排列，切换紧凑"); addButton(header, mode, 72);
        boolean auto = v.optJSONArray("seats").optJSONObject(v.optInt("self")).optBoolean("auto");
        Button automatic = button(auto ? "接回" : "代打", "auto_toggle", false, () -> client.submit(auto ? "resume" : "auto", null));
        automatic.setTextSize(13); automatic.setEnabled(canSubmit() && !"waiting".equals(v.optString("stage"))); addButton(header, automatic, 62);
        Button menu = button("⋯", "rules", false, this::menu); menu.setTextSize(22); addButton(header, menu, 48);
        return header;
    }
    private void renderHome() {
        String previousName = nickname == null ? client.name() : nickname.getText().toString();
        String previousCode = joinCode == null ? "" : joinCode.getText().toString();
        ScrollView scroll = new ScrollView(this); scroll.setFillViewport(true); scroll.setBackgroundColor(DARK);
        LinearLayout outer = column(); outer.setId(R.id.app_root); outer.setPadding(dp(24), dp(landscape ? 18 : 38), dp(24), dp(22));
        LinearLayout page = column(); page.setPadding(dp(8), 0, dp(8), 0); int max = dp(600);
        LinearLayout.LayoutParams pageParams = new LinearLayout.LayoutParams(Math.min(getResources().getDisplayMetrics().widthPixels - dp(48), max), -2); pageParams.gravity = Gravity.CENTER_HORIZONTAL;
        outer.addView(page, pageParams); scroll.addView(outer); setContentView(scroll);
        LinearLayout title = row(); TextView brand = text("亲友掼蛋", 30, TEXT); brand.setTypeface(Typeface.SERIF, Typeface.BOLD);
        title.addView(brand, new LinearLayout.LayoutParams(0, -2, 1)); addButton(title, button("帮助", "rules", false, this::homeHelp), 70); page.addView(title);
        TextView intro = text("亲友同桌，缺人电脑来凑。", 17, MUTED); intro.setPadding(0, dp(14), 0, dp(20)); page.addView(intro);
        page.addView(text("怎么称呼你", 17, TEXT)); nickname = edit("输入称呼（可不填）", "nickname", false); nickname.setText(previousName); nickname.setFilters(new InputFilter[] { new InputFilter.LengthFilter(14) }); page.addView(nickname);
        Button create = button("建一桌，等亲友", "create_room", true, () -> { hideKeyboard(); client.join(true, "", nickname.getText().toString().trim()); });
        create.setEnabled(!client.busy()); marginAdd(page, create, 18);
        LinearLayout join = row(); joinCode = edit("8位牌桌号", "join_code", true); joinCode.setText(previousCode); joinCode.setFilters(new InputFilter[] { new InputFilter.LengthFilter(8) });
        join.addView(joinCode, new LinearLayout.LayoutParams(0, dp(54), 1));
        Button enter = button("入座", "join_room", false, () -> { hideKeyboard(); client.join(false, joinCode.getText().toString(), nickname.getText().toString().trim()); });
        enter.setEnabled(!client.busy()); addButton(join, enter, 100); marginAdd(page, join, 14);
        Button practice = button("先和电脑练一局", "practice", false, () -> { hideKeyboard(); client.startPractice(nickname.getText().toString().trim(), practiceDifficulty()); });
        practice.setEnabled(!client.busy()); marginAdd(page, practice, 20);
        Button difficulty = button("电脑难度：" + DIFFICULTY_NAMES[difficultyIndex(practiceDifficulty())], "difficulty_open", false, () -> difficultyDialog(true));
        difficulty.setEnabled(!client.busy()); marginAdd(page, difficulty, 12);
        TextView note = text("练习无需联网。原座位保存在本机应用中，重开自动回桌。", 14, MUTED); marginAdd(page, note, 16);
        if (!client.message().isEmpty()) marginAdd(page, status(client.message()), 12);
    }
    private EditText edit(String hint, String name, boolean number) {
        EditText value = new EditText(this); value.setId(id(name)); value.setTextColor(TEXT); value.setHintTextColor(MUTED); value.setTextSize(18);
        value.setHint(hint); value.setSingleLine(); value.setPadding(dp(12), dp(8), dp(12), dp(8)); value.setMinHeight(dp(54));
        value.setBackground(surface(Color.rgb(25, 50, 38), 6, Color.rgb(102, 123, 94)));
        value.setInputType(number ? InputType.TYPE_CLASS_NUMBER : InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_CAP_WORDS); return value;
    }
    private void marginAdd(LinearLayout parent, View child, int top) { LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(-1, -2); p.topMargin = dp(top); parent.addView(child, p); }
    private void waiting(LinearLayout page, JSONObject v) throws Exception {
        LinearLayout content = column(); content.setPadding(dp(20), dp(landscape ? 8 : 16), dp(20), dp(landscape ? 8 : 18)); page.addView(content);
        TextView code = text(v.getString("code"), 33, GOLD); code.setTypeface(Typeface.DEFAULT, Typeface.BOLD); code.setGravity(Gravity.CENTER); content.addView(code);
        TextView note = text("把桌号告诉亲友。对面是队友，空位由电脑补齐。", 17, TEXT); note.setGravity(Gravity.CENTER); marginAdd(content, note, 10);
        JSONArray seats = v.getJSONArray("seats"); int self = v.getInt("self");
        LinearLayout seatLine = null;
        for (int seat = 0; seat < 4; seat++) {
            final int destination = seat; JSONObject player = seats.getJSONObject(seat);
            String role = seat == self ? "你" : seat % 2 == self % 2 ? "你的队友" : "另一队";
            boolean empty = "empty".equals(player.getString("kind"));
            Button target = button(player.getString("name") + " · " + role + (empty ? "（点此换座）" : ""), empty ? "sit_" + seat : "seat_" + seat,
                seat == self, () -> { if (empty) client.submit("switch", fields("seat", destination)); });
            target.setEnabled(empty && canSubmit());
            if (landscape) {
                if (seat % 2 == 0) { seatLine = row(); marginAdd(content, seatLine, 10); }
                addButton(seatLine, target, 0);
            } else marginAdd(content, target, 10);
        }
        Button copy = button("复制桌号", null, false, () -> {
            ((ClipboardManager) getSystemService(CLIPBOARD_SERVICE)).setPrimaryClip(ClipData.newPlainText("掼蛋牌桌号", v.optString("code")));
            activityMessage = "桌号已复制，请发给亲友"; render();
        });
        Button exit = button("离开牌桌", "leave_open", false, this::leave);
        Button difficulty = button("电脑难度：" + difficultyName(v), "difficulty_open", false, () -> difficultyDialog(false));
        if (landscape) { LinearLayout tools = row(); addButton(tools, copy, 0); addButton(tools, difficulty, 0); addButton(tools, exit, 0); marginAdd(content, tools, 12); }
        else { marginAdd(content, copy, 14); marginAdd(content, difficulty, 10); }
        Button start = button("开始 · 空位电脑补齐", "start_game", true, () -> client.submit("start", null));
        start.setEnabled(v.getInt("host") == self && canSubmit()); marginAdd(content, start, 12);
        if (!landscape) marginAdd(content, exit, 10);
    }
    private FrameLayout board(JSONObject v) throws Exception {
        FrameLayout board = new FrameLayout(this); board.setId(R.id.table_board); int self = v.getInt("self");
        addPerson(board, v, (self + 2) % 4, Gravity.TOP | Gravity.CENTER_HORIZONTAL, 0, 3);
        addPerson(board, v, (self + 3) % 4, Gravity.TOP | Gravity.LEFT, 9, landscape ? 20 : 55);
        addPerson(board, v, (self + 1) % 4, Gravity.TOP | Gravity.RIGHT, 9, landscape ? 20 : 55);
        LinearLayout center = row(); center.setGravity(Gravity.CENTER); center.setPadding(dp(4), dp(3), dp(4), 0);
        JSONObject last = v.optJSONObject("last");
        if (last != null) {
            String who = v.getJSONArray("seats").getJSONObject(last.getInt("seat")).getString("name");
            TextView lastName = text(who + " · " + last.getJSONObject("pattern").getString("name"), 12, MUTED); lastName.setMaxLines(1); center.addView(lastName);
            JSONArray cards = last.getJSONArray("cards");
            for (int i = 0; i < Math.min(10, cards.length()); i++) {
                JSONObject card = cards.getJSONObject(i); TextView mini = text(rank(card.getInt("rank")) + suit(card.getString("suit")), 17, isRed(card) ? RED : INK);
                mini.setTypeface(Typeface.SERIF, Typeface.BOLD); mini.setGravity(Gravity.CENTER); mini.setBackground(surface(PAPER, 3, Color.rgb(210, 201, 174)));
                LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(dp(28), dp(34)); p.leftMargin = dp(3); center.addView(mini, p);
            }
        }
        String turn = "tribute".equals(v.getString("stage")) ? "贡还牌 · 请按提示还牌" : v.getInt("turn") == self ? "轮到你了" :
            "轮到" + v.getJSONArray("seats").getJSONObject(Math.max(0, v.getInt("turn"))).getString("name");
        TextView turnLabel = text(turn, 15, GOLD); turnLabel.setId(R.id.round_status); turnLabel.setPadding(dp(10), 0, 0, 0); center.addView(turnLabel);
        FrameLayout.LayoutParams p = new FrameLayout.LayoutParams(-2, dp(39), Gravity.BOTTOM | Gravity.CENTER_HORIZONTAL); p.bottomMargin = dp(2); board.addView(center, p);
        return board;
    }
    private void addPerson(FrameLayout board, JSONObject v, int seat, int gravity, int side, int top) throws Exception {
        JSONObject player = v.getJSONArray("seats").getJSONObject(seat); boolean mate = seat % 2 == v.getInt("self") % 2;
        LinearLayout person = row(); person.setId(id("seat_" + seat)); person.setPadding(dp(6), dp(3), dp(6), dp(3));
        TextView icon = text(player.getString("name").substring(0, 1), 15, GOLD); icon.setGravity(Gravity.CENTER);
        icon.setBackground(surface(Color.rgb(53, 83, 58), 20, Color.rgb(117, 138, 98))); person.addView(icon, new LinearLayout.LayoutParams(dp(30), dp(30)));
        LinearLayout details = column(); details.setPadding(dp(7), 0, 0, 0);
        TextView name = text(player.getString("name") + "  " + player.optInt("count") + "张", 14, TEXT); name.setMaxLines(1); details.addView(name);
        String kind = "ai".equals(player.optString("kind")) ? "电脑" : player.optBoolean("auto") ? "电脑代打" : player.optBoolean("connected") ? "已入座" : "暂时离线";
        details.addView(text((mate ? "你的队友" : "另一队") + " · " + kind, 10, mate ? GOLD : MUTED)); person.addView(details);
        FrameLayout.LayoutParams p = new FrameLayout.LayoutParams(-2, -2, gravity); p.topMargin = dp(top); p.leftMargin = dp(side); p.rightMargin = dp(side); board.addView(person, p);
    }
    private View hand(JSONObject v) throws Exception {
        JSONArray source = v.getJSONArray("hand"); LinearLayout area = column(); area.setId(R.id.hand); area.setPadding(dp(8), dp(6), dp(8), 0);
        TextView measure = text(compact ? "10♠" : "10", compact ? 18 : 21, INK); measure.setTypeface(Typeface.SERIF, Typeface.BOLD);
        int minimumWidth = Math.max(52, Math.round(measure.getPaint().measureText(measure.getText().toString()) / getResources().getDisplayMetrics().density) + 12);
        int columns = Math.min(14, Math.max(3, (widthDp - 16) / (minimumWidth + 4)));
        List<JSONObject> cards = new ArrayList<>(); for (int i = 0; i < source.length(); i++) cards.add(source.getJSONObject(i));
        if (compact) {
            Map<Integer, List<JSONObject>> groups = new LinkedHashMap<>();
            for (JSONObject card : cards) { int rank = card.getInt("rank"), key = rank >= 16 ? 16 : rank; if (!groups.containsKey(key)) groups.put(key, new ArrayList<>()); groups.get(key).add(card); }
            List<List<JSONObject>> values = new ArrayList<>(groups.values());
            for (int start = 0; start < values.size(); start += columns) {
                LinearLayout line = row(); line.setGravity(Gravity.BOTTOM); int max = 1;
                for (int j = start; j < Math.min(values.size(), start + columns); j++) max = Math.max(max, Math.min(3, values.get(j).size()));
                int overlap = Math.max(26, Math.round(22 * getResources().getConfiguration().fontScale + 4));
                int badgeHeight = Math.round(16 * getResources().getConfiguration().fontScale);
                int height = badgeHeight + cardHeight() + (max - 1) * overlap;
                for (int j = start; j < Math.min(values.size(), start + columns); j++) {
                    List<JSONObject> group = values.get(j); FrameLayout pile = new FrameLayout(this); pile.setId(id("group_" + (group.get(0).getInt("rank") >= 16 ? 16 : group.get(0).getInt("rank"))));
                    int visible = Math.min(3, group.size()), selectedCount = 0;
                    for (JSONObject c : group) if (selected.contains(c.getInt("id"))) selectedCount++;
                    for (int k = 0; k < visible; k++) {
                        View card = card(group.get(k), v, false); FrameLayout.LayoutParams p = new FrameLayout.LayoutParams(-1, dp(cardHeight()), Gravity.BOTTOM); p.bottomMargin = dp((visible - 1 - k) * overlap); pile.addView(card, p);
                    }
                    TextView count = text("共" + group.size() + "张" + (selectedCount > 0 ? " · 选" + selectedCount : ""), 10, GOLD); count.setMaxLines(1);
                    FrameLayout.LayoutParams countParams = new FrameLayout.LayoutParams(-1, dp(badgeHeight), Gravity.TOP); countParams.topMargin = dp((max - visible) * overlap); pile.addView(count, countParams);
                    pile.setClickable(true); pile.setFocusable(true); pile.setContentDescription("一组" + rank(group.get(0).getInt("rank")) + "，共" + group.size() + "张，已选" + selectedCount + "张，点按展开全部选牌");
                    pile.setOnClickListener(x -> openGroup(group));
                    LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(0, dp(height), 1); p.setMargins(dp(2), 0, dp(2), 0); line.addView(pile, p);
                }
                for (int j = line.getChildCount(); j < columns; j++) line.addView(new View(this), new LinearLayout.LayoutParams(0, dp(height), 1));
                area.addView(line);
            }
        } else {
            int rows = Math.max((27 + columns - 1) / columns, (cards.size() + columns - 1) / columns);
            for (int r = 0; r < rows; r++) {
                LinearLayout line = row();
                for (int c = 0; c < columns; c++) {
                    int index = r * columns + c; View item = index < cards.size() ? card(cards.get(index), v, true) : new View(this);
                    LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(0, dp(cardHeight()), 1); p.setMargins(dp(2), 0, dp(2), dp(4)); line.addView(item, p);
                }
                area.addView(line);
            }
        }
        return area;
    }
    private FrameLayout card(JSONObject c, JSONObject v, boolean interactive) throws Exception {
        int cardId = c.getInt("id"), rank = c.getInt("rank"); boolean on = selected.contains(cardId), red = isRed(c);
        FrameLayout card = new FrameLayout(this); if (interactive) card.setId(id("card_" + cardId));
        card.setPadding(dp(4), dp(3), dp(4), dp(3)); card.setSelected(on);
        card.setBackground(surface(on ? Color.rgb(244, 224, 175) : PAPER, 4, on ? GOLD : Color.rgb(207, 200, 180))); card.setElevation(dp(on ? 4 : 2));
        card.setTranslationY(on ? -dp(4) : 0);
        TextView corner = text(rank(rank) + (compact && rank < 16 ? suit(c.getString("suit")) : ""), compact ? 18 : 21, red ? RED : INK);
        corner.setTypeface(rank >= 16 ? Typeface.DEFAULT : Typeface.SERIF, Typeface.BOLD); corner.setMaxLines(1); if (rank >= 16) corner.setTextSize(11);
        card.addView(corner, new FrameLayout.LayoutParams(-1, -2, Gravity.TOP));
        TextView shape = text(suit(c.getString("suit")), 25, red ? RED : INK); shape.setTypeface(Typeface.SERIF);
        card.addView(shape, new FrameLayout.LayoutParams(-2, -2, Gravity.BOTTOM | Gravity.LEFT));
        boolean wild = rank == v.optInt("level") && "H".equals(c.getString("suit"));
        if (wild) { TextView flag = text("配", 9, Color.rgb(113, 91, 43)); FrameLayout.LayoutParams p = new FrameLayout.LayoutParams(-2, -2, Gravity.BOTTOM | Gravity.RIGHT); card.addView(flag, p); }
        if (on) { TextView mark = text("✓", 15, Color.rgb(113, 91, 43)); card.addView(mark, new FrameLayout.LayoutParams(-2, -2, Gravity.BOTTOM | Gravity.RIGHT)); }
        String description = suitName(c.getString("suit")) + rank(rank) + (wild ? "，红桃配牌" : "");
        card.setContentDescription((on ? "已选中，" : "") + description + (interactive ? "，点按选择或取消" : ""));
        if (interactive) { card.setClickable(true); card.setFocusable(true); card.setOnClickListener(x -> toggle(cardId)); }
        return card;
    }
    private boolean contains(JSONArray values, int id) { if (values != null) for (int i = 0; i < values.length(); i++) if (values.optInt(i, -1) == id) return true; return false; }
    private void toggle(int card) {
        JSONObject v = client.view(); if (v == null || client.busy()) return;
        if (v.optJSONArray("seats").optJSONObject(v.optInt("self")).optBoolean("auto")) return;
        if ("tribute".equals(v.optString("stage"))) {
            if (!contains(v.optJSONArray("returnIds"), card)) { selectionMessage = "请选提示范围内的一张还牌"; render(); return; }
            boolean had = selected.contains(card); selected.clear(); if (!had) selected.add(card);
        } else if (selected.contains(card)) selected.remove(card);
        else if (selected.size() < 10) selected.add(card);
        else { selectionMessage = "一手最多选10张牌"; render(); return; }
        patterns = new JSONArray(); chosen = ""; selectionMessage = ""; render(); requestPreview();
    }
    private LinearLayout selection(JSONObject v) {
        LinearLayout line = row(); line.setPadding(dp(10), 0, dp(10), 0);
        String summary = selectionMessage;
        if (summary.isEmpty()) summary = selected.isEmpty() ? "你 · " + v.optJSONArray("hand").length() + "张　" + (compact ? "点牌组展开选牌" : "点牌选择，再点一次取消") : "已选 " + selected.size() + " 张" + (!chosen.isEmpty() ? " · " + patternName(chosen) + " · 可以出" : "");
        TextView label = text(summary, 13, GOLD); label.setId(R.id.selection_info); line.addView(label, new LinearLayout.LayoutParams(0, -2, 1));
        if (patterns.length() > 1) { Button choices = button("换牌型", "pattern_choice", false, this::choosePattern); choices.setTextSize(12); addButton(line, choices, 80); }
        Button clear = button("取消选牌", "selection_clear", false, () -> { selected.clear(); patterns = new JSONArray(); chosen = ""; selectionMessage = ""; previewGeneration++; render(); });
        clear.setTextSize(12); clear.setEnabled(!selected.isEmpty()); addButton(line, clear, 92); return line;
    }
    private void requestPreview() {
        JSONObject v = client.view(); if (v == null || selected.isEmpty() || !"playing".equals(v.optString("stage")) || v.optInt("turn") != v.optInt("self")) return;
        final int generation = ++previewGeneration, version = v.optInt("version"); final String key = selectedKey();
        client.preview(selectedIds(), response -> {
            if (generation != previewGeneration || !key.equals(selectedKey()) || client.view() == null || client.view().optInt("version") != version) return;
            patterns = response.optJSONArray("patterns"); if (patterns == null) patterns = new JSONArray();
            boolean found = false; for (int i = 0; i < patterns.length(); i++) if (chosen.equals(patterns.optJSONObject(i).optString("id"))) found = true;
            if (!found) chosen = patterns.length() > 0 ? patterns.optJSONObject(0).optString("id") : "";
            selectionMessage = patterns.length() == 0 ? response.optString("message", "请重新选牌") : ""; render();
        });
    }
    private String patternName(String pattern) { for (int i = 0; i < patterns.length(); i++) if (pattern.equals(patterns.optJSONObject(i).optString("id"))) return patterns.optJSONObject(i).optString("name"); return ""; }
    private void hint() {
        JSONObject v = client.view(); if (v == null) return; final int version = v.optInt("version");
        client.hint(hintCursor++, response -> {
            if (client.view() == null || client.view().optInt("version") != version) return;
            selected.clear(); JSONArray ids = response.optJSONArray("ids"); if (ids != null) for (int i = 0; i < ids.length(); i++) selected.add(ids.optInt(i));
            chosen = response.optString("patternId", ""); patterns = new JSONArray();
            selectionMessage = ids == null || ids.length() == 0 ? "这手压不过，可以点不要" : "已选候选牌，请确认；再点提示可换一手";
            render(); requestPreview();
        });
    }
    private AlertDialog.Builder dialog(String title) { return new AlertDialog.Builder(new ContextThemeWrapper(this, R.style.AppDialogTheme)).setTitle(title); }
    private void choosePattern() {
        JSONObject snapshot = client.view(); if (snapshot == null) return;
        final int version = snapshot.optInt("version"); final String round = snapshot.optString("roundId"), selection = selectedKey();
        String[] names = new String[patterns.length()], ids = new String[patterns.length()];
        for (int i = 0; i < names.length; i++) { JSONObject p = patterns.optJSONObject(i); names[i] = p.optString("name"); JSONArray substitutions = p.optJSONArray("substitutions");
            ids[i] = p.optString("id");
            if (substitutions != null && substitutions.length() > 0) names[i] += "（配牌作" + rank(substitutions.optJSONObject(0).optInt("rank")) + "）"; }
        patternDialog = dialog("这手牌按哪种牌型出").setItems(names, (d, which) -> {
            JSONObject current = client.view();
            if (current == null || current.optInt("version") != version || !round.equals(current.optString("roundId")) || !selection.equals(selectedKey())) {
                activityMessage = "牌局已更新，请重新选择牌型"; render(); return;
            }
            chosen = ids[which]; render();
        }).setNegativeButton("返回", null).create();
        patternDialog.setOnDismissListener(d -> patternDialog = null); patternDialog.show();
    }
    private void closePattern() { if (patternDialog != null) { AlertDialog old = patternDialog; patternDialog = null; old.dismiss(); } }
    private void openGroup(List<JSONObject> cards) {
        if (client.busy() || client.view() == null) return;
        groupBefore = new LinkedHashSet<>(selected); groupCards = cards; groupCommitted = false;
        LinearLayout box = column(); box.setPadding(dp(12), dp(8), dp(12), dp(8));
        final Map<Integer, FrameLayout> tiles = new LinkedHashMap<>();
        try {
            int columns = Math.min(6, Math.max(3, (widthDp - 64) / 68));
            for (int start = 0; start < cards.size(); start += columns) {
                LinearLayout line = row();
                for (int i = start; i < Math.min(cards.size(), start + columns); i++) {
                    JSONObject c = cards.get(i); int cardId = c.getInt("id"); FrameLayout tile = card(c, client.view(), false); tile.setId(id("card_" + cardId)); tiles.put(cardId, tile);
                    tile.setClickable(true); tile.setFocusable(true); tile.setOnClickListener(x -> {
                        JSONObject v = client.view(); if (v == null) return;
                        if ("tribute".equals(v.optString("stage"))) {
                            if (!contains(v.optJSONArray("returnIds"), cardId)) return;
                            boolean had = selected.contains(cardId); selected.clear(); if (!had) selected.add(cardId);
                        } else if (selected.contains(cardId)) selected.remove(cardId); else if (selected.size() < 10) selected.add(cardId);
                        for (Map.Entry<Integer, FrameLayout> entry : tiles.entrySet()) {
                            boolean on = selected.contains(entry.getKey()); entry.getValue().setSelected(on);
                            entry.getValue().setBackground(surface(on ? Color.rgb(244, 224, 175) : PAPER, 4, on ? GOLD : Color.rgb(207, 200, 180)));
                        }
                    });
                    LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(dp(60), dp(78)); p.setMargins(dp(4), dp(5), dp(4), dp(5)); line.addView(tile, p);
                }
                box.addView(line);
            }
            ScrollView scroll = new ScrollView(this); scroll.addView(box);
            groupDialog = dialog("选择手牌 · 选好后仍需确认出牌").setView(scroll).setNegativeButton("取消", (d, which) -> {})
                .setPositiveButton("选好了", (d, which) -> { groupCommitted = true; patterns = new JSONArray(); chosen = ""; selectionMessage = ""; render(); requestPreview(); }).create();
            groupDialog.setOnDismissListener(d -> {
                if (!groupCommitted && groupBefore != null) { selected.clear(); selected.addAll(groupBefore); selected.retainAll(available(client.view())); }
                groupDialog = null; groupCards = null; groupBefore = null; render();
            });
            groupDialog.show(); groupDialog.getButton(AlertDialog.BUTTON_POSITIVE).setId(R.id.group_close);
        } catch (Exception e) { activityMessage = "请重新选择这组牌"; render(); }
    }
    private void closeGroup(boolean keep) {
        if (groupDialog != null) { groupCommitted = keep; AlertDialog old = groupDialog; groupDialog = null; old.dismiss(); }
    }
    private void result(LinearLayout page, JSONObject v) throws Exception {
        LinearLayout box = column(); box.setPadding(dp(28), dp(20), dp(28), dp(20)); page.addView(box);
        boolean match = "matchOver".equals(v.getString("stage")); JSONObject result = v.getJSONObject("result");
        TextView title = text(match ? "本场结束 · 已过 A" : "第" + v.getInt("round") + "副结束", 27, GOLD); title.setGravity(Gravity.CENTER); box.addView(title);
        int own = v.getInt("self") % 2, winner = result.getInt("winner");
        TextView outcome = text((winner == own ? "你们" : "另一队") + (match ? "过A获胜" : "升" + result.getInt("upgrade") + "级"), 21, TEXT); outcome.setGravity(Gravity.CENTER); marginAdd(box, outcome, 15);
        JSONArray order = result.getJSONArray("order"), seats = v.getJSONArray("seats");
        for (int i = 0; i < order.length(); i++) {
            boolean doubleDown = result.optBoolean("doubleDown") && i >= 2;
            String place = doubleDown ? "双下" : new String[] { "头游", "二游", "三游", "末游" }[i];
            TextView entry = text(place + "　" + seats.getJSONObject(order.getInt(i)).getString("name"), 18, TEXT); entry.setGravity(Gravity.CENTER); marginAdd(box, entry, 9);
        }
        Button next = button(match ? "再来一场" : "继续下一副", "next_game", true, () -> client.submit(match ? "restart" : "next", null));
        next.setEnabled(v.getInt("host") == v.getInt("self") && canSubmit()); marginAdd(box, next, 20);
        if (v.getInt("host") != v.getInt("self")) marginAdd(box, text("等房主继续，大家会一起进入下一副。", 15, MUTED), 12);
        marginAdd(box, button("电脑难度：" + difficultyName(v), "difficulty_open", false, () -> difficultyDialog(false)), 10);
        marginAdd(box, button("离开牌桌", "leave_open", false, this::leave), 10);
    }
    private void leave() {
        if (client.pending()) {
            dialog("操作仍待确认").setMessage("请先点重试这次操作，确认牌桌状态后再离开。")
                .setPositiveButton("知道了", null).show(); return;
        }
        AlertDialog dialog = dialog("离开这张牌桌？").setMessage("离开会释放座位。只是歇一会儿，可以先请电脑代打。")
            .setNegativeButton("留下继续", null).setPositiveButton("确认离开", (d, which) -> client.submit("leave", null)).create();
        dialog.show(); dialog.getButton(AlertDialog.BUTTON_POSITIVE).setId(R.id.leave_confirm);
    }
    private void menu() {
        dialog("牌桌选项").setItems(new String[] { "玩法说明", "电脑难度：" + difficultyName(client.view()), "离开牌桌" },
            (d, which) -> { if (which == 0) rules(); else if (which == 1) difficultyDialog(false); else leave(); }).setNegativeButton("返回", null).show();
    }
    private void difficultyDialog(boolean home) {
        JSONObject view = client.view();
        if (!home && (view == null || !canSubmit())) return;
        if (!home && (view.optInt("host") != view.optInt("self") || !java.util.Arrays.asList("waiting", "roundOver", "matchOver").contains(view.optString("stage")))) {
            dialog("电脑难度：" + difficultyName(view)).setMessage(view.optInt("host") != view.optInt("self") ?
                "本桌电脑使用同一档难度，由房主在开局前或两副之间调整。" : "这一副保持当前难度，打完后可以调整。")
                .setPositiveButton("知道了", null).show(); return;
        }
        final int[] choice = { difficultyIndex(home ? practiceDifficulty() : view.optString("difficulty", "standard")) };
        final int version = view == null ? -1 : view.optInt("version");
        final String code = view == null ? "" : view.optString("code"), round = view == null ? "" : view.optString("roundId"), stage = view == null ? "" : view.optString("stage");
        final int self = view == null ? -1 : view.optInt("self");
        AlertDialog picker = dialog("电脑难度").setSingleChoiceItems(new String[] {
            "轻松\n优先简单出牌，适合熟悉操作", "标准\n出牌与配合比较均衡", "进阶\n更注意保留组合、拦截与收尾"
        }, choice[0], (d, which) -> choice[0] = which).setNegativeButton("取消", null).setPositiveButton("确定", null).create();
        picker.show(); picker.getButton(AlertDialog.BUTTON_POSITIVE).setId(R.id.difficulty_confirm);
        picker.getButton(AlertDialog.BUTTON_NEGATIVE).setId(R.id.difficulty_cancel);
        picker.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(button -> {
            if (home) {
                try { DurablePreferences.commit(display, display.edit().putString("difficulty", DIFFICULTIES[choice[0]])); }
                catch (java.io.IOException error) { activityMessage = "难度未能保存，请再试一次"; picker.dismiss(); render(); return; }
                picker.dismiss(); render();
            } else {
                JSONObject current = client.view();
                if (current == null || current.optInt("version") != version || !code.equals(current.optString("code")) ||
                    !round.equals(current.optString("roundId")) || !stage.equals(current.optString("stage")) ||
                    current.optInt("self") != self || current.optInt("host") != self || !canSubmit()) {
                    picker.dismiss(); activityMessage = "牌桌已更新，请重新选择难度"; render(); return;
                }
                picker.dismiss(); client.submit("difficulty", fields("difficulty", DIFFICULTIES[choice[0]]));
            }
        });
    }
    private void homeHelp() {
        dialog("帮助").setItems(new String[] { "玩法说明", "设置亲友联机服务", "关于与开源许可" }, (d, which) -> {
            if (which == 0) rules(); else if (which == 1) serverDialog(); else dialog("亲友掼蛋 " + BuildConfig.VERSION_NAME)
                .setMessage("RulerCompass1729\n原生Android客户端。联机由服务端裁判，练习在本机运行同份规则。\n\nJava-WebSocket：MIT\nRhino：MPL 2.0\n源码与许可：https://github.com/RulerCompass1729/guandan")
                .setNeutralButton("开源许可", (about, button) -> licenses())
                .setPositiveButton("知道了", null).show();
        }).setNegativeButton("返回", null).show();
    }
    private void licenses() {
        try (java.io.BufferedReader reader = new java.io.BufferedReader(new java.io.InputStreamReader(getAssets().open("THIRD_PARTY_NOTICES.txt"), java.nio.charset.StandardCharsets.UTF_8))) {
            StringBuilder body = new StringBuilder(); String line;
            while ((line = reader.readLine()) != null) body.append(line).append('\n');
            TextView content = text(body.toString(), 14, TEXT); content.setMaxLines(Integer.MAX_VALUE); content.setPadding(dp(16), dp(12), dp(16), dp(12));
            ScrollView scroll = new ScrollView(this); scroll.addView(content); dialog("开源许可与源码").setView(scroll).setPositiveButton("知道了", null).show();
        } catch (java.io.IOException error) { dialog("开源许可").setMessage("请查看源码仓库内的THIRD_PARTY_NOTICES.txt").setPositiveButton("知道了", null).show(); }
    }
    private void serverDialog() {
        EditText address = edit("组织者提供的HTTPS地址", "server_address", false); address.setText(client.server()); address.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        AlertDialog dialog = dialog("设置亲友联机服务").setMessage("联机需要大家连接同一服务，只设置一次。尚未开放公网服务时，可以先和电脑练习。")
            .setView(address).setNegativeButton("返回", null).setPositiveButton("保存", null).create();
        dialog.show(); Button save = dialog.getButton(AlertDialog.BUTTON_POSITIVE); save.setId(R.id.server_save);
        save.setOnClickListener(v -> client.saveServer(address.getText().toString(), error -> {
            if (error == null) { hideKeyboard(); dialog.dismiss(); activityMessage = "联机服务已保存"; render(); }
            else address.setError(error);
        }));
    }
    private void rules() {
        TextView content = text("两副牌，四人对家合作。每人27张，先从2打起。\n\n红桃级牌可以配牌，不能配大小王。同牌型比大小；炸弹、同花顺按本桌规则比较。\n\n先选牌，点错可取消；提示只选候选牌，仍需自己确认出牌。\n\n上一副的名次决定升级、进贡与还牌。还牌时请选择提示范围内的一张。\n\n需要歇一会儿可请电脑代打，回来点接回。断线后保留座位，重开应用回原桌。\n\n当前规则：gd-2022-home-v1。紧凑排列点牌组展开；大字排列直接逐张点选。", 17, TEXT);
        content.setPadding(dp(20), dp(14), dp(20), dp(14)); content.setMaxLines(Integer.MAX_VALUE); ScrollView scroll = new ScrollView(this); scroll.addView(content);
        AlertDialog dialog = dialog("本桌玩法").setView(scroll).setPositiveButton("知道了", null).create(); dialog.show(); dialog.getButton(AlertDialog.BUTTON_POSITIVE).setId(R.id.dialog_close);
    }
    private String rank(int value) { if (value >= 2 && value <= 10) return String.valueOf(value); switch (value) { case 11:return "J";case 12:return "Q";case 13:return "K";case 14:return "A";case 16:return "小王";case 17:return "大王";default:return "?"; } }
    private String suit(String value) { switch (value) { case "S":return "♠";case "H":return "♥";case "C":return "♣";case "D":return "♦";default:return "★"; } }
    private String suitName(String value) { switch (value) { case "S":return "黑桃";case "H":return "红桃";case "C":return "梅花";case "D":return "方块";default:return ""; } }
    private boolean isRed(JSONObject card) { return "H".equals(card.optString("suit")) || "D".equals(card.optString("suit")) || card.optInt("rank") == 17; }
}
