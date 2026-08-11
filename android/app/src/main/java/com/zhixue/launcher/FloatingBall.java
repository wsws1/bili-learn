package com.zhixue.launcher;

import android.content.Context;
import android.content.Intent;
import android.graphics.PixelFormat;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.provider.Settings;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;
import android.widget.TextView;

/**
 * 悬浮球保活：App 退后台时显示一个常驻悬浮球。
 * 交互：默认靠边吸附（可拖动调整位置，松手自动吸到最近边缘）；
 * 单击一次展开变大，再单击才进入 App，避免拖动误触。
 */
public class FloatingBall {

    private static final int STATE_COLLAPSED = 0;
    private static final int STATE_EXPANDED = 1;

    private final Context appCtx;
    private final WindowManager wm;
    private TextView ball;
    private WindowManager.LayoutParams lp;
    private boolean showing = false;
    private int state = STATE_COLLAPSED;

    private int downX;
    private int downY;
    private int startX;
    private int startY;
    private boolean dragging = false;

    public FloatingBall(Context ctx) {
        appCtx = ctx.getApplicationContext();
        wm = (WindowManager) appCtx.getSystemService(Context.WINDOW_SERVICE);
    }

    public boolean canShow() {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(appCtx);
    }

    public void show() {
        if (showing || ball != null || wm == null || !canShow()) return;
        state = STATE_COLLAPSED;
        int size = sizeForState();
        ball = new TextView(appCtx);
        ball.setTextColor(0xFFFFFFFF);
        ball.setTextSize(12);
        ball.setGravity(Gravity.CENTER);
        ball.setLineSpacing(0, 0.9f);
        GradientDrawable bg = new GradientDrawable();
        bg.setShape(GradientDrawable.OVAL);
        bg.setColor(0xE62E6BE6);
        ball.setBackground(bg);
        ball.setElevation(dp(4));
        applyBallText();

        int type = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
                : WindowManager.LayoutParams.TYPE_PHONE;
        lp = new WindowManager.LayoutParams(
                size, size, type,
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                        | WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL,
                PixelFormat.TRANSLUCENT);
        // 用绝对坐标，方便拖动与吸附计算
        lp.gravity = Gravity.TOP | Gravity.LEFT;
        lp.x = screenWidth() - size - dp(6);
        lp.y = screenHeight() / 2 - size / 2;
        clampPos();

        ball.setOnTouchListener((v, e) -> {
            switch (e.getActionMasked()) {
                case MotionEvent.ACTION_DOWN:
                    downX = (int) e.getRawX();
                    downY = (int) e.getRawY();
                    startX = lp.x;
                    startY = lp.y;
                    dragging = false;
                    return true;
                case MotionEvent.ACTION_MOVE:
                    int dx = (int) e.getRawX() - downX;
                    int dy = (int) e.getRawY() - downY;
                    if (!dragging && (Math.abs(dx) > dp(8) || Math.abs(dy) > dp(8))) {
                        dragging = true;
                    }
                    if (dragging) {
                        lp.x = startX + dx;
                        lp.y = startY + dy;
                        clampPos();
                        try {
                            wm.updateViewLayout(v, lp);
                        } catch (Exception ignored) {
                        }
                    }
                    return true;
                case MotionEvent.ACTION_UP:
                case MotionEvent.ACTION_CANCEL:
                    if (dragging) {
                        // 拖动结束：吸附到最近边缘，不进入应用
                        snapToEdge();
                        try {
                            wm.updateViewLayout(v, lp);
                        } catch (Exception ignored) {
                        }
                    } else if (state == STATE_COLLAPSED) {
                        // 单击：展开变大
                        expand();
                    } else {
                        // 再单击：进入应用
                        openApp();
                    }
                    return true;
            }
            return false;
        });

        try {
            wm.addView(ball, lp);
            showing = true;
            KeepAliveLog.i(appCtx, "float ball shown");
        } catch (Exception e) {
            KeepAliveLog.e(appCtx, "float ball show failed", e);
            ball = null;
            lp = null;
        }
    }

    public void hide() {
        if (!showing || ball == null || wm == null) return;
        try {
            wm.removeView(ball);
        } catch (Exception ignored) {
        }
        ball = null;
        lp = null;
        showing = false;
    }

    private void expand() {
        state = STATE_EXPANDED;
        if (ball == null || lp == null) return;
        int oldSize = lp.width;
        int cx = lp.x + oldSize / 2;
        int cy = lp.y + oldSize / 2;
        int newSize = sizeForState();
        lp.width = newSize;
        lp.height = newSize;
        lp.x = cx - newSize / 2;
        lp.y = cy - newSize / 2;
        clampPos();
        applyBallText();
        try {
            wm.updateViewLayout(ball, lp);
        } catch (Exception ignored) {
        }
    }

    private void snapToEdge() {
        if (lp == null || ball == null) return;
        int leftDist = lp.x;
        int rightDist = screenWidth() - (lp.x + lp.width);
        lp.x = leftDist <= rightDist ? 0 : screenWidth() - lp.width;
        clampPos();
    }

    private void clampPos() {
        if (lp == null) return;
        int w = screenWidth();
        int h = screenHeight();
        lp.x = Math.max(0, Math.min(lp.x, w - lp.width));
        lp.y = Math.max(0, Math.min(lp.y, h - lp.height));
    }

    private int sizeForState() {
        return state == STATE_EXPANDED ? dp(88) : dp(48);
    }

    private void applyBallText() {
        if (ball != null) {
            ball.setText(state == STATE_EXPANDED ? "知学\n进入" : "知学");
        }
    }

    private void openApp() {
        try {
            Intent i = new Intent(appCtx, MainActivity.class);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            appCtx.startActivity(i);
        } catch (Exception ignored) {
        }
    }

    private int screenWidth() {
        return appCtx.getResources().getDisplayMetrics().widthPixels;
    }

    private int screenHeight() {
        return appCtx.getResources().getDisplayMetrics().heightPixels;
    }

    private int dp(int v) {
        return Math.round(v * appCtx.getResources().getDisplayMetrics().density);
    }
}
