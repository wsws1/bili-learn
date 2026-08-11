package com.zhixue.launcher;

import android.content.Context;
import android.util.Log;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStreamWriter;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/**
 * 保活诊断日志：同时输出到 logcat 和 App 内嵌 Node 的数据目录，
 * 这样启动器诊断面板（/api/logs）也能看到 Android 侧的服务生命周期事件，
 * 无需 adb 即可排查“切后台后服务是否被系统停掉”。
 */
public final class KeepAliveLog {

    private static final String TAG = "zhixue";
    private static final String FILE_NAME = "keepalive.log";
    private static final long MAX_SIZE = 64 * 1024;

    private KeepAliveLog() {}

    public static void i(Context ctx, String msg) {
        Log.i(TAG, "keepalive: " + msg);
        append(ctx, msg);
    }

    public static void e(Context ctx, String msg, Throwable t) {
        Log.e(TAG, "keepalive: " + msg, t);
        append(ctx, msg + (t != null ? " | " + t : ""));
    }

    private static void append(Context ctx, String msg) {
        try {
            File dir = new File(ctx.getFilesDir(), "nodejs/data");
            if (!dir.exists() && !dir.mkdirs()) return;
            File f = new File(dir, FILE_NAME);
            if (f.exists() && f.length() > MAX_SIZE) {
                // 超过 64KB 直接重开，只保留最近日志
                f.delete();
            }
            String line = "[" + new SimpleDateFormat("MM-dd HH:mm:ss.SSS", Locale.US).format(new Date()) + "] " + msg + "\n";
            try (FileOutputStream fos = new FileOutputStream(f, true);
                 OutputStreamWriter w = new OutputStreamWriter(fos, StandardCharsets.UTF_8)) {
                w.write(line);
            }
        } catch (Exception ignored) {
            // 日志写入失败不影响主流程
        }
    }
}
