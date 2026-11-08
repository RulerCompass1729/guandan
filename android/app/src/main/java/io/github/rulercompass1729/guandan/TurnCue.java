package io.github.rulercompass1729.guandan;

/** Presentation follows confirmed client state, including reconnect and auto-play. */
final class TurnCue {
    final String title, detail;
    final boolean ready;
    private TurnCue(String title, String detail, boolean ready) { this.title = title; this.detail = detail; this.ready = ready; }
    static TurnCue resolve(boolean connected, boolean busy, boolean pending, boolean auto,
                           boolean returning, boolean own, String player) {
        if (!connected) return new TurnCue("连接已中断", pending ? "操作已保留，请重试确认" : "请重新连接原牌桌", false);
        if (pending || busy) return new TurnCue("正在确认操作", "请稍候，确认后再继续", false);
        if (auto) return new TurnCue("电脑正在代打", "想自己打，可点右上角接回", false);
        if (returning) return own ? new TurnCue("轮到您还牌", "选一张合法牌，再点确认还牌", true) :
            new TurnCue("等待还牌", "大家还牌后继续", false);
        return own ? new TurnCue("轮到您出牌", "先选牌，再点确认出牌", true) :
            new TurnCue("请稍候", player + "正在出牌", false);
    }
}
