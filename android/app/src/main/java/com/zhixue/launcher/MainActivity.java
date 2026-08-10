package com.zhixue.launcher;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
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
    }
}
