package io.github.rulercompass1729.guandan;

import android.content.Context;
import android.graphics.*;
import android.util.LruCache;
import android.view.View;
import java.io.InputStream;

/** Classic offline card faces with jumbo indexes; same face in hand, group and table. */
final class PokerCardView extends View {
    private static final LruCache<String, Bitmap> CACHE = new LruCache<String, Bitmap>(8 * 1024 * 1024) {
        @Override protected int sizeOf(String key, Bitmap value) { return value.getByteCount(); }
    };
    private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG);
    private final RectF rect = new RectF();
    private final Bitmap face;
    private final int rank, color;
    private final String suit;
    private final boolean wild;
    private final float density, scaledDensity;
    PokerCardView(Context context, int rank, String suit, boolean wild) {
        super(context); this.rank = rank; this.suit = suit; this.wild = wild;
        density = getResources().getDisplayMetrics().density; scaledDensity = getResources().getDisplayMetrics().scaledDensity;
        color = "H".equals(suit) || "D".equals(suit) || rank == 17 ? Color.rgb(189, 29, 43) : Color.rgb(22, 28, 35);
        String file = rank >= 16 ? "joker_" + (rank == 17 ? "red" : "black") :
            ("S".equals(suit) ? "spade" : "H".equals(suit) ? "heart" : "C".equals(suit) ? "club" : "diamond") + "_" +
            (rank == 14 ? "1" : rank == 11 ? "jack" : rank == 12 ? "queen" : rank == 13 ? "king" : String.valueOf(rank));
        Bitmap found = CACHE.get(file);
        if (found == null) {
            try (InputStream stream = context.getAssets().open("cards/" + file + ".png")) {
                BitmapFactory.Options options = new BitmapFactory.Options(); options.inSampleSize = 2;
                found = BitmapFactory.decodeStream(stream, null, options);
                if (found == null) throw new IllegalStateException("Invalid card face " + file);
                CACHE.put(file, found);
            } catch (java.io.IOException error) { throw new IllegalStateException("Missing offline card face " + file, error); }
        }
        face = found; setImportantForAccessibility(IMPORTANT_FOR_ACCESSIBILITY_NO);
    }
    private float dp(float value) { return value * density; }
    @Override protected void drawableStateChanged() { super.drawableStateChanged(); invalidate(); }
    @Override protected void onDraw(Canvas canvas) {
        super.onDraw(canvas); float w = getWidth(), h = getHeight(); rect.set(0, 0, w, h);
        if (rank == 16) { ColorMatrix gray = new ColorMatrix(); gray.setSaturation(0); paint.setColorFilter(new ColorMatrixColorFilter(gray)); }
        canvas.drawBitmap(face, null, rect, paint); paint.setColorFilter(null);
        if (rank < 16) {
            boolean mini = w < dp(40);
            float size = Math.min((mini ? 13 : 23) * scaledDensity, h * (mini ? .44f : .37f));
            String value = rank == 14 ? "A" : rank == 13 ? "K" : rank == 12 ? "Q" : rank == 11 ? "J" : String.valueOf(rank);
            paint.setTypeface(Typeface.create(Typeface.SERIF, Typeface.BOLD)); paint.setTextSize(size);
            float indexWidth = Math.min(w * .62f, paint.measureText(value) + dp(5));
            paint.setColor(Color.WHITE); rect.set(dp(2), dp(2), indexWidth, Math.min(h - dp(3), size * 1.72f)); canvas.drawRect(rect, paint);
            paint.setColor(color); canvas.drawText(value, dp(3), size * .87f, paint);
            paint.setTextSize(size * .72f); canvas.drawText("S".equals(suit) ? "♠" : "H".equals(suit) ? "♥" : "C".equals(suit) ? "♣" : "♦", dp(3), size * 1.57f, paint);
        }
        if (wild) {
            paint.setTypeface(Typeface.DEFAULT_BOLD); paint.setTextSize(Math.min(dp(12), h * .18f));
            paint.setColor(Color.rgb(245, 206, 111)); rect.set(w - dp(18), h - dp(21), w - dp(2), h - dp(3)); canvas.drawRoundRect(rect, dp(3), dp(3), paint);
            paint.setColor(Color.rgb(68, 47, 13)); canvas.drawText("配", w - dp(16), h - dp(7), paint);
        }
        if (isSelected()) {
            paint.setColor(Color.rgb(244, 187, 70)); paint.setStyle(Paint.Style.STROKE); paint.setStrokeWidth(dp(3));
            rect.set(dp(1.5f), dp(1.5f), w - dp(1.5f), h - dp(1.5f)); canvas.drawRoundRect(rect, dp(4), dp(4), paint); paint.setStyle(Paint.Style.FILL);
            paint.setColor(Color.rgb(241, 185, 67)); canvas.drawCircle(w - dp(10), dp(10), dp(9), paint);
            paint.setTypeface(Typeface.DEFAULT_BOLD); paint.setTextSize(dp(14)); paint.setColor(Color.rgb(30, 48, 35)); canvas.drawText("✓", w - dp(16), dp(15), paint);
        }
    }
}
