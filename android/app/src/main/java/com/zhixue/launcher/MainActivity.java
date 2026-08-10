package com.zhixue.launcher;

import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
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
