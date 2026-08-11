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
 * 华为/小米/vivo 等国产 ROM 对“有可见悬浮窗”的应用一般不冻结，
 * 用于在系统后台管理无入口（如鸿蒙 NEXT + 卓易通容器）时尽量降低被冻结概率。
 */
public class FloatingBall {

    private final Context appCtx;
    private final WindowManager wm;
    private View ball;
    private WindowManager.LayoutParams lp;
    private boolean showing = false;

    public FloatingBall(Context ctx) {
        appCtx = ctx.getApplicationContext();
        wm = (WindowManager) appCtx.getSystemService(Context.WINDOW_SERVICE);
    }

    public boolean canShow() {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(appCtx);
    }

    public void show() {
        if (showing || ball != null || wm == null || !canShow()) return;
        int size = dp(48);
        TextView tv = new TextView(appCtx);
        tv.setText("知学");
        tv.setTextColor(0xFFFFFFFF);
        tv.setTextSize(12);
        tv.setGravity(Gravity.CENTER);
        GradientDrawable bg = new GradientDrawable();
        bg.setShape(GradientDrawable.OVAL);
        bg.setColor(0xE62E6BE6);
        tv.setBackground(bg);
        tv.setElevation(dp(4));

        int type = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
                : WindowManager.LayoutParams.TYPE_PHONE;
        lp = new WindowManager.LayoutParams(
                size, size, type,
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                        | WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL,
                PixelFormat.TRANSLUCENT);
        lp.gravity = Gravity.RIGHT | Gravity.CENTER_VERTICAL;
        lp.x = dp(6);

        tv.setOnClickListener(v -> openApp());
        final int[] downRaw = new int[2];
        tv.setOnTouchListener((v, e) -> {
            switch (e.getActionMasked()) {
                case MotionEvent.ACTION_DOWN:
                    downRaw[0] = (int) e.getRawX();
                    downRaw[1] = (int) e.getRawY();
                    return false;
                case MotionEvent.ACTION_MOVE:
                    lp.x += (int) e.getRawX() - downRaw[0];
                    lp.y += (int) e.getRawY() - downRaw[1];
                    downRaw[0] = (int) e.getRawX();
                    downRaw[1] = (int) e.getRawY();
                    try {
                        wm.updateViewLayout(v, lp);
                    } catch (Exception ignored) {
                    }
                    return true;
            }
            return false;
        });

        try {
            wm.addView(tv, lp);
            ball = tv;
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

    private void openApp() {
        try {
            Intent i = new Intent(appCtx, MainActivity.class);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            appCtx.startActivity(i);
        } catch (Exception ignored) {
        }
    }

    private int dp(int v) {
        return Math.round(v * appCtx.getResources().getDisplayMetrics().density);
    }
}
