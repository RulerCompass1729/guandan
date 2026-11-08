package io.github.rulercompass1729.guandan;

import android.content.Context;
import android.graphics.*;
import android.view.View;

/** Small, calm win/loss emblem. Animation is applied to the result ribbon. */
final class ResultEmblemView extends View {
    private final boolean won;
    private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
    ResultEmblemView(Context context, boolean won) { super(context); this.won = won; setImportantForAccessibility(IMPORTANT_FOR_ACCESSIBILITY_NO); }
    @Override protected void onDraw(Canvas c) {
        super.onDraw(c); c.save(); c.scale(getWidth() / 72f, getHeight() / 72f);
        paint.setColor(won ? Color.rgb(239, 197, 101) : Color.rgb(172, 199, 211)); paint.setStrokeWidth(3); paint.setStyle(Paint.Style.STROKE);
        if (won) {
            c.drawArc(new RectF(13, 14, 59, 46), 0, 180, false, paint);
            Path cup = new Path(); cup.moveTo(22, 13); cup.lineTo(50, 13); cup.lineTo(47, 35); cup.quadTo(36, 50, 25, 35); cup.close(); c.drawPath(cup, paint);
            c.drawLine(36, 43, 36, 56, paint); c.drawLine(24, 58, 48, 58, paint);
            c.drawLine(10, 6, 15, 11, paint); c.drawLine(61, 6, 56, 11, paint); c.drawLine(36, 1, 36, 7, paint);
        } else {
            c.save(); c.rotate(-12, 30, 36); c.drawRoundRect(new RectF(15, 12, 43, 56), 4, 4, paint); c.restore();
            c.drawRoundRect(new RectF(29, 18, 57, 62), 4, 4, paint); c.drawCircle(43, 39, 5, paint);
        }
        paint.setStyle(Paint.Style.FILL); c.restore();
    }
}
