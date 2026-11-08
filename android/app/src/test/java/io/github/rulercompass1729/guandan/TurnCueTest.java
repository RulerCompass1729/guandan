package io.github.rulercompass1729.guandan;
import static org.junit.Assert.*;
import org.junit.Test;
public class TurnCueTest {
    @Test public void onlyConfirmedHumanTurnGetsReadyCue() {
        TurnCue cue = TurnCue.resolve(true, false, false, false, false, true, "牌友");
        assertTrue(cue.ready); assertEquals("轮到您出牌", cue.title);
        assertFalse(TurnCue.resolve(true, false, false, false, false, false, "牌友甲").ready);
    }
    @Test public void staleOwnTurnNeverOverridesDisconnectPendingOrAuto() {
        TurnCue offline = TurnCue.resolve(false, false, false, false, false, true, "牌友");
        assertFalse(offline.ready); assertEquals("连接已中断", offline.title);
        TurnCue pending = TurnCue.resolve(true, false, true, false, false, true, "牌友");
        assertFalse(pending.ready); assertEquals("正在确认操作", pending.title);
        assertFalse(TurnCue.resolve(true, true, false, false, false, true, "牌友").ready);
        TurnCue auto = TurnCue.resolve(true, false, false, true, false, true, "牌友");
        assertFalse(auto.ready); assertEquals("电脑正在代打", auto.title);
    }
    @Test public void tributeOnlyInvitesTheReceiverWhoStillOwesAReturn() {
        assertEquals("轮到您还牌", TurnCue.resolve(true, false, false, false, true, true, "牌友").title);
        assertFalse(TurnCue.resolve(true, false, false, false, true, false, "牌友").ready);
    }
}
