package io.github.rulercompass1729.guandan;

import java.security.SecureRandom;
import org.mozilla.javascript.BaseFunction;
import org.mozilla.javascript.Context;
import org.mozilla.javascript.Function;
import org.mozilla.javascript.Scriptable;
import org.mozilla.javascript.ScriptableObject;

/** Interprets the bundled shared engine. There is no WebView or HTML UI. */
public final class PracticeEngine {
    private final Scriptable scope;
    private final Function dispatch;
    private final SecureRandom random = new SecureRandom();

    public PracticeEngine(String script) {
        Context cx = enter();
        try {
            scope = cx.initSafeStandardObjects();
            ScriptableObject.putProperty(scope, "nativeRandom", new BaseFunction() {
                @Override public Object call(Context c, Scriptable s, Scriptable self, Object[] args) { return random.nextDouble(); }
            });
            cx.evaluateString(scope, "Math.random = nativeRandom;", "secure-random", 1, null);
            cx.evaluateString(scope, script, "local-game.js", 1, null);
            Scriptable engine = (Scriptable) ScriptableObject.getProperty(scope, "GuandanOffline");
            dispatch = (Function) ScriptableObject.getProperty(engine, "dispatch");
        } finally { Context.exit(); }
    }
    private Context enter() {
        Context cx = Context.enter();
        cx.setLanguageVersion(Context.VERSION_ES6);
        cx.setOptimizationLevel(-1);
        cx.setClassShutter(name -> false);
        return cx;
    }
    public synchronized String request(String json) {
        Context cx = enter();
        try { return Context.toString(dispatch.call(cx, scope, scope, new Object[] { json })); }
        finally { Context.exit(); }
    }
}
