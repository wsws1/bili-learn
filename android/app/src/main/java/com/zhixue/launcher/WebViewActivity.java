package com.zhixue.launcher;

import android.app.Activity;
import android.app.PictureInPictureParams;
import android.content.pm.ActivityInfo;
import android.content.res.Configuration;
import android.graphics.Color;
import android.os.Bundle;
import android.os.Build;
import android.util.Rational;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.webkit.WebChromeClient;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.ImageButton;
import android.widget.LinearLayout;

/**
 * 应用内打开网页版：App 自带的全屏 WebView，受应用控制（不冻结、可返回）。
 * 支持视频全屏（onShowCustomView）与返回键处理。
 */
public class WebViewActivity extends Activity {

    private WebView web;
    private FrameLayout root;
    private View bar;
    private WebChromeClient chromeClient;
    private View customView;
    private WebChromeClient.CustomViewCallback customViewCallback;
    private boolean ratioKnown = false;
    private boolean portraitVideo = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        String url = getIntent().getStringExtra("url");
        if (url == null) url = "http://127.0.0.1:3210";

        root = new FrameLayout(this);
        root.setBackgroundColor(0xFFF7F8FA);

        // 顶部栏：关闭按钮
        LinearLayout topBar = new LinearLayout(this);
        topBar.setOrientation(LinearLayout.HORIZONTAL);
        topBar.setGravity(Gravity.CENTER_VERTICAL);
        topBar.setBackgroundColor(0xFFF7F8FA);
        ImageButton close = new ImageButton(this);
        close.setImageResource(android.R.drawable.ic_menu_close_clear_cancel);
        close.setBackgroundColor(Color.TRANSPARENT);
        close.setContentDescription("关闭");
        close.setPadding(dp(10), dp(10), dp(10), dp(10));
        close.setOnClickListener(v -> finish());
        topBar.addView(close, new LinearLayout.LayoutParams(dp(44), dp(44)));
        bar = topBar;
        root.addView(topBar, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.WRAP_CONTENT,
                Gravity.TOP));

        web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(true);
        // 允许无手势自动播放（视频页加载后由 JS 直接 play）
        s.setMediaPlaybackRequiresUserGesture(false);
        web.setBackgroundColor(0xFFF7F8FA);
        web.setWebViewClient(new WebViewClient());

        chromeClient = new WebChromeClient() {
            @Override
            public void onShowCustomView(View view, CustomViewCallback callback) {
                if (customView != null) {
                    callback.onCustomViewHidden();
                    return;
                }
                customView = view;
                customViewCallback = callback;
                root.addView(customView, new FrameLayout.LayoutParams(
                        FrameLayout.LayoutParams.MATCH_PARENT,
                        FrameLayout.LayoutParams.MATCH_PARENT));
                bar.setVisibility(View.GONE);
                web.setVisibility(View.INVISIBLE);
                // 按视频宽高比选择横屏/竖屏全屏：竖版视频强制横屏会导致全屏被取消
                if (ratioKnown) {
                    setRequestedOrientation(portraitVideo
                            ? ActivityInfo.SCREEN_ORIENTATION_PORTRAIT
                            : ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE);
                } else {
                    setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED);
                }
                getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            }

            @Override
            public void onHideCustomView() {
                if (customView == null) return;
                root.removeView(customView);
                customView = null;
                customViewCallback = null;
                bar.setVisibility(View.VISIBLE);
                web.setVisibility(View.VISIBLE);
                setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED);
                getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            }
        };
        web.setWebChromeClient(chromeClient);
        // 小窗桥接：前端先触发视频全屏，再调用 enter() 进入系统画中画（避免截取整页）
        web.addJavascriptInterface(new Object() {
            @JavascriptInterface
            public boolean supports() {
                return Build.VERSION.SDK_INT >= 26;
            }

            @JavascriptInterface
            public void enter() {
                runOnUiThread(() -> {
                    try {
                        if (Build.VERSION.SDK_INT >= 26 && !isInPictureInPictureMode()) {
                            Rational ratio = ratioKnown
                                    ? (portraitVideo ? new Rational(9, 16) : new Rational(16, 9))
                                    : new Rational(16, 9);
                            PictureInPictureParams params = new PictureInPictureParams.Builder()
                                    .setAspectRatio(ratio)
                                    .build();
                            enterPictureInPictureMode(params);
                        }
                    } catch (Exception ignored) {
                    }
                });
            }

            @JavascriptInterface
            public void setVideoRatio(int width, int height) {
                if (width > 0 && height > 0) {
                    ratioKnown = true;
                    portraitVideo = height > width;
                }
            }
        }, "AndroidPip");

        root.addView(web, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT));
        setContentView(root);
        web.loadUrl(url);
    }

    @Override
    public void onBackPressed() {
        if (customView != null) {
            chromeClient.onHideCustomView();
        } else if (web != null && web.canGoBack()) {
            web.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    public void onPictureInPictureModeChanged(boolean isInPictureInPictureMode, Configuration newConfig) {
        super.onPictureInPictureModeChanged(isInPictureInPictureMode, newConfig);
        // 退出小窗：收起全屏视频视图，回到网页
        if (!isInPictureInPictureMode) {
            runOnUiThread(() -> {
                if (chromeClient != null) chromeClient.onHideCustomView();
            });
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
