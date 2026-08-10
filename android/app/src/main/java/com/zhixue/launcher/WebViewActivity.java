package com.zhixue.launcher;

import android.app.Activity;
import android.graphics.Color;
import android.os.Bundle;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.ImageButton;
import android.widget.LinearLayout;

/**
 * 应用内打开网页版：App 自带的全屏 WebView，受应用控制（不冻结、可返回）。
 * 网页版是纯网页（public/），只需普通 WebView 即可，不依赖 Capacitor。
 */
public class WebViewActivity extends Activity {

    private WebView web;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        String url = getIntent().getStringExtra("url");
        if (url == null) url = "http://127.0.0.1:3210";

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);

        // 顶部栏：关闭按钮
        LinearLayout bar = new LinearLayout(this);
        bar.setOrientation(LinearLayout.HORIZONTAL);
        bar.setBackgroundColor(0xFFF7F8FA);
        bar.setGravity(android.view.Gravity.CENTER_VERTICAL);

        ImageButton close = new ImageButton(this);
        close.setImageResource(android.R.drawable.ic_menu_close_clear_cancel);
        close.setBackgroundColor(Color.TRANSPARENT);
        close.setContentDescription("关闭");
        close.setPadding(dp(10), dp(10), dp(10), dp(10));
        close.setOnClickListener(v -> finish());
        bar.addView(close, new LinearLayout.LayoutParams(dp(44), dp(44)));

        root.addView(bar, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT));

        web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(true);
        web.setBackgroundColor(0xFFF7F8FA);
        web.setWebViewClient(new WebViewClient());
        root.addView(web, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                0,
                1f));

        setContentView(root);
        web.loadUrl(url);
    }

    @Override
    public void onBackPressed() {
        if (web != null && web.canGoBack()) {
            web.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onDestroy() {
        if (web != null) {
            web.stopLoading();
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }

    private int dp(int v) {
        return Math.round(v * getResources().getDisplayMetrics().density);
    }
}
