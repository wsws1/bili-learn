package com.zhixue.launcher;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import android.util.Log;

import androidx.core.app.NotificationCompat;

/**
 * 前台服务：保持 App 进程在后台不被挂起/冻结，内嵌 Node 服务才能持续响应网页版的请求。
 * 切到浏览器后回到启动器再回浏览器“数据才出来”，就是进程被系统挂起导致请求停半路。
 */
public class KeepAliveService extends Service {

    private static final String CHANNEL_ID = "zhixue_keepalive";
    private static final int NOTIF_ID = 1;

    @Override
    public void onCreate() {
        super.onCreate();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "知学本地服务",
                    NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("保持本地 Node 服务运行，网页版才能正常收发数据");
            NotificationManager nm = getSystemService(NotificationManager.class);
            if (nm != null) nm.createNotificationChannel(channel);
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        Log.i("zhixue", "keepalive onStartCommand startId=" + startId);
        try {
            Intent launch = new Intent(this, MainActivity.class);
            PendingIntent pi = PendingIntent.getActivity(this, 0, launch, PendingIntent.FLAG_IMMUTABLE);
            Notification notification = new NotificationCompat.Builder(this, CHANNEL_ID)
                    .setContentTitle("知学")
                    .setContentText("本地服务运行中，网页版数据实时可用")
                    .setSmallIcon(R.mipmap.ic_launcher)
                    .setOngoing(true)
                    .setContentIntent(pi)
                    .build();
            if (Build.VERSION.SDK_INT >= 34) {
                startForeground(NOTIF_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
            } else {
                startForeground(NOTIF_ID, notification);
            }
            Log.i("zhixue", "keepalive foreground started");
        } catch (Exception e) {
            Log.e("zhixue", "keepalive startForeground failed: " + e, e);
        }
        return START_STICKY;
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
