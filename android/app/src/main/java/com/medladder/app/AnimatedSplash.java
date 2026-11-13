package com.medladder.app;

import android.animation.Animator;
import android.animation.AnimatorSet;
import android.animation.ObjectAnimator;
import android.app.Activity;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.ColorFilter;
import android.graphics.Matrix;
import android.graphics.Paint;
import android.graphics.PixelFormat;
import android.graphics.drawable.ColorDrawable;
import android.graphics.drawable.Drawable;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.ViewTreeObserver;
import android.view.animation.DecelerateInterpolator;
import android.view.animation.OvershootInterpolator;
import android.widget.FrameLayout;
import android.widget.ImageView;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import java.util.ArrayList;
import java.util.List;

/**
 * Animated launch screen built from the MedLadder splash artwork (992 x 1586 design).
 *
 * The background art is drawn full screen (also behind the status/navigation bars) and the
 * logo, "Med" / "Ladder", the three tagline words and the four feature tiles animate in on top.
 * It stays until the animation has played AND the first page has loaded (max ~6 s), then fades out.
 */
public class AnimatedSplash {

    private static final float DW = 992f, DH = 1586f;   // artwork size
    private static final float CX = 496f, CY = 730f;    // content block anchor in the artwork
    private static final float CONTENT_W = 740f;        // width of the logo/text/tiles block

    // Piece boxes in artwork pixels: left, top, right, bottom
    private static final int[][] BOX = {
        {240, 290, 740, 710},   // 0 logo
        {140, 720, 421, 840},   // 1 "Med"
        {421, 720, 860, 840},   // 2 "Ladder"
        {200, 845, 385, 915},   // 3 "Learn."
        {385, 845, 630, 915},   // 4 "Practice."
        {630, 845, 800, 915},   // 5 "Excel."
        {140, 968, 290, 1168},  // 6 QBank
        {330, 968, 480, 1168},  // 7 PYQs
        {520, 968, 670, 1168},  // 8 Tests
        {705, 968, 855, 1168},  // 9 Study
    };
    private static final int[] RES = {
        R.drawable.splash_logo, R.drawable.splash_med, R.drawable.splash_ladder,
        R.drawable.splash_tag1, R.drawable.splash_tag2, R.drawable.splash_tag3,
        R.drawable.splash_tile1, R.drawable.splash_tile2, R.drawable.splash_tile3, R.drawable.splash_tile4,
    };

    private static final long MAX_SHOW_MS = 6000;
    private static final long ANIM_TOTAL_MS = 2100;

    private final Activity activity;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final List<ImageView> pieces = new ArrayList<>();
    private FrameLayout overlay;
    private Bitmap bgBitmap;
    private boolean animDone = false;
    private boolean contentReady = false;
    private boolean finished = false;
    private Integer pendingBarsColor = null;
    private ViewTreeObserver.OnGlobalLayoutListener layoutListener;

    public AnimatedSplash(Activity activity) {
        this.activity = activity;
    }

    public boolean isShowing() {
        return overlay != null && !finished;
    }

    /** Colour the page wants behind the system bars; applied once the splash is gone. */
    public void setPendingBarsColor(int color) {
        pendingBarsColor = color;
    }

    public void show() {
        try {
            final ViewGroup decor = (ViewGroup) activity.getWindow().getDecorView();
            BitmapFactory.Options opts = new BitmapFactory.Options();
            opts.inScaled = false;
            bgBitmap = BitmapFactory.decodeResource(activity.getResources(), R.drawable.splash_bg, opts);

            decor.setBackground(new CenterCropArt(decor));

            overlay = new FrameLayout(activity);
            overlay.setBackground(new CenterCropArt(overlay));
            overlay.setClickable(true); // swallow touches while the splash is showing

            for (int i = 0; i < RES.length; i++) {
                ImageView iv = new ImageView(activity);
                iv.setImageResource(RES[i]);
                iv.setScaleType(ImageView.ScaleType.FIT_XY);
                iv.setAlpha(0f);
                FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(1, 1);
                lp.gravity = Gravity.TOP | Gravity.START;
                overlay.addView(iv, lp);
                pieces.add(iv);
            }

            activity.addContentView(overlay, new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

            // Dark status-bar icons over the light art, light nav-bar icons over the purple band
            WindowInsetsControllerCompat bars = WindowCompat.getInsetsController(activity.getWindow(), decor);
            bars.setAppearanceLightStatusBars(true);
            bars.setAppearanceLightNavigationBars(false);

            layoutListener = new ViewTreeObserver.OnGlobalLayoutListener() {
                boolean started = false;

                @Override
                public void onGlobalLayout() {
                    // This observer belongs to the whole window and keeps firing after the
                    // splash is gone, so it must never touch a removed overlay.
                    FrameLayout ov = overlay;
                    if (ov == null || finished && ov.getParent() == null) return;
                    layoutPieces();
                    ov.invalidate();
                    decor.invalidate();
                    if (!started && ov.getWidth() > 0) {
                        started = true;
                        animateIn();
                    }
                }
            };
            decor.getViewTreeObserver().addOnGlobalLayoutListener(layoutListener);

            handler.postDelayed(this::finish, MAX_SHOW_MS);
        } catch (Throwable t) {
            // Never block the app on the splash
            finished = true;
            removeOverlay();
        }
    }

    /** Called when the first page has loaded. */
    public void markContentReady() {
        contentReady = true;
        maybeFinish();
    }

    private void maybeFinish() {
        if (animDone && contentReady && !finished) handler.postDelayed(this::finish, 250);
    }

    private void layoutPieces() {
        View decor = activity.getWindow().getDecorView();
        float W = decor.getWidth(), H = decor.getHeight();
        if (W <= 0 || H <= 0 || overlay == null) return;
        float s = Math.max(W / DW, H / DH);
        float offY = (H - DH * s) / 2f;
        float c = Math.min(s, W * 0.94f / CONTENT_W);
        int[] loc = new int[2];
        overlay.getLocationInWindow(loc);

        for (int i = 0; i < pieces.size(); i++) {
            int[] b = BOX[i];
            float w = (b[2] - b[0]) * c;
            float h = (b[3] - b[1]) * c;
            float x = W / 2f + (b[0] - CX) * c - loc[0];
            float cy = offY + CY * s + (((b[1] + b[3]) / 2f) - CY) * c;
            float y = cy - h / 2f - loc[1];
            ImageView iv = pieces.get(i);
            FrameLayout.LayoutParams lp = (FrameLayout.LayoutParams) iv.getLayoutParams();
            int nw = Math.round(w), nh = Math.round(h), nx = Math.round(x), ny = Math.round(y);
            if (lp.width != nw || lp.height != nh || lp.leftMargin != nx || lp.topMargin != ny) {
                lp.width = nw;
                lp.height = nh;
                lp.leftMargin = nx;
                lp.topMargin = ny;
                iv.setLayoutParams(lp);
            }
        }
    }

    private void animateIn() {
        if (overlay == null) return;
        float density = activity.getResources().getDisplayMetrics().density;
        float slide = overlay.getWidth() * 0.18f;
        List<Animator> all = new ArrayList<>();

        // Logo: pop in
        all.add(pop(pieces.get(0), 0, 650, 0.55f, 1.3f));
        // "Med" from the left, "Ladder" from the right
        all.add(slideX(pieces.get(1), 380, 520, -slide));
        all.add(slideX(pieces.get(2), 460, 520, slide));
        // Tagline words, one after another
        for (int i = 0; i < 3; i++) all.add(rise(pieces.get(3 + i), 950 + i * 170L, 380, 18 * density));
        // Feature tiles
        for (int i = 0; i < 4; i++) all.add(pop(pieces.get(6 + i), 1450 + i * 110L, 420, 0.5f, 1.6f));

        AnimatorSet set = new AnimatorSet();
        set.playTogether(all);
        set.start();
        handler.postDelayed(() -> {
            animDone = true;
            maybeFinish();
        }, ANIM_TOTAL_MS);
    }

    private Animator pop(View v, long delay, long dur, float fromScale, float overshoot) {
        v.setScaleX(fromScale);
        v.setScaleY(fromScale);
        AnimatorSet s = new AnimatorSet();
        ObjectAnimator a = ObjectAnimator.ofFloat(v, View.ALPHA, 0f, 1f);
        a.setInterpolator(new DecelerateInterpolator());
        ObjectAnimator sx = ObjectAnimator.ofFloat(v, View.SCALE_X, fromScale, 1f);
        ObjectAnimator sy = ObjectAnimator.ofFloat(v, View.SCALE_Y, fromScale, 1f);
        sx.setInterpolator(new OvershootInterpolator(overshoot));
        sy.setInterpolator(new OvershootInterpolator(overshoot));
        s.playTogether(a, sx, sy);
        s.setStartDelay(delay);
        s.setDuration(dur);
        return s;
    }

    private Animator slideX(View v, long delay, long dur, float fromX) {
        v.setTranslationX(fromX);
        AnimatorSet s = new AnimatorSet();
        ObjectAnimator a = ObjectAnimator.ofFloat(v, View.ALPHA, 0f, 1f);
        ObjectAnimator t = ObjectAnimator.ofFloat(v, View.TRANSLATION_X, fromX, 0f);
        t.setInterpolator(new DecelerateInterpolator(2.2f));
        s.playTogether(a, t);
        s.setStartDelay(delay);
        s.setDuration(dur);
        return s;
    }

    private Animator rise(View v, long delay, long dur, float fromY) {
        v.setTranslationY(fromY);
        AnimatorSet s = new AnimatorSet();
        ObjectAnimator a = ObjectAnimator.ofFloat(v, View.ALPHA, 0f, 1f);
        ObjectAnimator t = ObjectAnimator.ofFloat(v, View.TRANSLATION_Y, fromY, 0f);
        t.setInterpolator(new DecelerateInterpolator(2f));
        s.playTogether(a, t);
        s.setStartDelay(delay);
        s.setDuration(dur);
        return s;
    }

    private void finish() {
        if (finished) return;
        finished = true;
        handler.removeCallbacksAndMessages(null);
        if (overlay == null) return;
        // Stop catching touches right away, so the app underneath is usable during the fade.
        overlay.setClickable(false);
        overlay.setFocusable(false);
        overlay.setOnTouchListener((v, e) -> false);
        overlay.animate()
            .alpha(0f)
            .scaleX(1.04f)
            .scaleY(1.04f)
            .setDuration(300)
            .withEndAction(this::removeOverlay)
            .start();
        // withEndAction does not run if the animation gets cancelled: always remove anyway.
        handler.postDelayed(this::removeOverlay, 450);
    }

    private void removeOverlay() {
        if (overlay == null) return;
        try {
            View decor = activity.getWindow().getDecorView();
            if (layoutListener != null) {
                decor.getViewTreeObserver().removeOnGlobalLayoutListener(layoutListener);
                layoutListener = null;
            }
            decor.setBackground(new ColorDrawable(pendingBarsColor != null ? pendingBarsColor : 0xFFFFFFFF));
            if (overlay != null && overlay.getParent() instanceof ViewGroup) {
                ((ViewGroup) overlay.getParent()).removeView(overlay);
            }
        } catch (Throwable ignored) {}
        overlay = null;
        pieces.clear();
        bgBitmap = null;
    }

    /** Draws the background art centre-cropped to the full screen, aligned across views. */
    private class CenterCropArt extends Drawable {
        private final View host;
        private final Paint paint = new Paint(Paint.FILTER_BITMAP_FLAG | Paint.ANTI_ALIAS_FLAG);
        private final Matrix matrix = new Matrix();
        private final int[] loc = new int[2];

        CenterCropArt(View host) {
            this.host = host;
        }

        @Override
        public void draw(Canvas canvas) {
            Bitmap bmp = bgBitmap;
            if (bmp == null) return;
            View decor = activity.getWindow().getDecorView();
            float W = decor.getWidth(), H = decor.getHeight();
            if (W <= 0 || H <= 0) return;
            float s = Math.max(W / bmp.getWidth(), H / bmp.getHeight());
            host.getLocationInWindow(loc);
            matrix.setScale(s, s);
            matrix.postTranslate((W - bmp.getWidth() * s) / 2f - loc[0], (H - bmp.getHeight() * s) / 2f - loc[1]);
            canvas.drawBitmap(bmp, matrix, paint);
        }

        @Override
        public void setAlpha(int alpha) {
            paint.setAlpha(alpha);
        }

        @Override
        public void setColorFilter(ColorFilter colorFilter) {
            paint.setColorFilter(colorFilter);
        }

        @Override
        public int getOpacity() {
            return PixelFormat.OPAQUE;
        }
    }
}
