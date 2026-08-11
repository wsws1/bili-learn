package com.zhixue.launcher;

import android.app.ActivityManager;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.PowerManager;
import android.provider.Settings;
import android.webkit.JavascriptInterface;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // 暴露给前端：用系统浏览器独立打开网页（ACTION_VIEW），而不是 App 内 Custom Tabs
        getBridge().getWebView().addJavascriptInterface(new ExternalBrowserBridge(this), "ExternalBrowser");
        // 前台服务：防止进程后台被挂起，保证内嵌 Node 服务持续响应网页版请求
        Intent keepAlive = new Intent(this, KeepAliveService.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForegroundService(keepAlive);
        } else {
            startService(keepAlive);
        }
        // Android 13+ 申请通知权限，让“本地服务运行中”通知可见（也降低被系统杀后台的概率）
        if (Build.VERSION.SDK_INT >= 33
                && checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{android.Manifest.permission.POST_NOTIFICATIONS}, 1001);
        }
        checkBackgroundRestriction();
    }

    // 检测电池优化/后台限制，受限时引导用户去系统设置（自启动开关是否出现由 ROM 决定，无法代码控制）
    private void checkBackgroundRestriction() {
        KeepAliveLog.i(this, "device=" + Build.MANUFACTURER + " " + Build.MODEL
                + " android=" + Build.VERSION.RELEASE + " sdk=" + Build.VERSION.SDK_INT);
        boolean restricted = false;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
            boolean ignoring = pm != null && pm.isIgnoringBatteryOptimizations(getPackageName());
            KeepAliveLog.i(this, "battery whitelist(ignore battery optimizations)=" + ignoring);
            if (!ignoring) restricted = true;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            ActivityManager am = (ActivityManager) getSystemService(ACTIVITY_SERVICE);
            boolean bgRestricted = am != null && am.isBackgroundRestricted();
            KeepAliveLog.i(this, "isBackgroundRestricted=" + bgRestricted);
            if (bgRestricted) restricted = true;
        }
        KeepAliveLog.i(this, "restricted=" + restricted
                + " notifPermission=" + (Build.VERSION.SDK_INT >= 33
                ? (checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) : true));
        if (!restricted) return;

        String m = Build.MANUFACTURER == null ? "" : Build.MANUFACTURER.toLowerCase();
        String guide;
        if (m.contains("huawei") || m.contains("honor")) {
            guide = "请在「设置 → 应用 → 应用启动管理 → 知学」选择“手动管理”，并打开“自启动 / 后台活动 / 关联启动”。";
        } else if (m.contains("xiaomi") || m.contains("redmi")) {
            guide = "请在「设置 → 应用设置 → 应用管理 → 知学 → 省电策略」选择“无限制”，并允许自启动。";
        } else if (m.contains("oppo") || m.contains("vivo") || m.contains("oneplus")) {
            guide = "请在「手机管家/设置 → 应用管理 → 知学」允许自启动与后台运行，并将电池设置为“不限制”。";
        } else {
            guide = "请在系统设置中允许“知学”忽略电池优化，并允许后台运行。";
        }
        new AlertDialog.Builder(this)
                .setTitle("后台保活设置")
                .setMessage(guide + "\n\n若设置页没有“自启动”选项，请到手机管家/安全中心的「应用启动管理」中开启。")
                .setPositiveButton("去设置", (d, w) -> {
                    try {
                        Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
                        intent.setData(Uri.parse("package:" + getPackageName()));
                        startActivity(intent);
                    } catch (Exception ignored) {
                    }
                })
                .setNegativeButton("知道了", null)
                .show();
    }

    private static class ExternalBrowserBridge {
        private final MainActivity activity;

        ExternalBrowserBridge(MainActivity activity) {
            this.activity = activity;
        }

        @JavascriptInterface
        public void open(String url) {
            try {
                Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                activity.startActivity(intent);
            } catch (Exception ignored) {
            }
        }

        @JavascriptInterface
        public void openInApp(String url) {
            try {
                Intent intent = new Intent(activity, WebViewActivity.class);
                intent.putExtra("url", url);
                activity.startActivity(intent);
            } catch (Exception ignored) {
            }
        }

        @JavascriptInterface
        public void openBatterySettings() {
            try {
                Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
                intent.setData(Uri.parse("package:" + activity.getPackageName()));
                activity.startActivity(intent);
            } catch (Exception e) {
                try {
                    activity.startActivity(new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS));
                } catch (Exception ignored) {
                }
            }
        }

        @JavascriptInterface
        public void openAppSettings() {
            try {
                Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
                intent.setData(Uri.parse("package:" + activity.getPackageName()));
                activity.startActivity(intent);
            } catch (Exception ignored) {
            }
        }
    }
}
