// 原生探测与能力桥（esbuild 打包为 launcher/www/native.js）
import { Capacitor } from '@capacitor/core';
import { NodeJS } from '@jadejr/capacitor-nodejs';
import { Browser } from '@capacitor/browser';

window.BF_NATIVE = Capacitor.isNativePlatform();

// 给 Node 后端发消息（局域网开关等）
window.bridgeSend = (eventName, value) => {
  if (Capacitor.isNativePlatform()) {
    return NodeJS.send({ eventName, args: [value] });
  }
  return Promise.resolve();
};

// 打开系统浏览器
window.openWeb = (url) => {
  if (Capacitor.isNativePlatform()) {
    try {
      if (window.ExternalBrowser && typeof window.ExternalBrowser.open === 'function') {
        window.ExternalBrowser.open(url);
        return Promise.resolve();
      }
    } catch {}
    return Browser.open({ url });
  }
  window.open(url, '_blank');
  return Promise.resolve();
};

// 软件内打开：App 自带 WebView 全屏打开（受应用控制，不冻结）
window.openWebInApp = (url) => {
  if (Capacitor.isNativePlatform()) {
    try {
      if (window.ExternalBrowser && typeof window.ExternalBrowser.openInApp === 'function') {
        window.ExternalBrowser.openInApp(url);
        return Promise.resolve();
      }
    } catch {}
    return Browser.open({ url });
  }
  window.open(url, '_blank');
  return Promise.resolve();
};

// 后台保活设置：跳系统“电池优化”白名单页（鸿蒙/华为后台限制的关键步骤）
window.openBatterySettings = () => {
  if (Capacitor.isNativePlatform()) {
    try {
      if (window.ExternalBrowser && typeof window.ExternalBrowser.openBatterySettings === 'function') {
        window.ExternalBrowser.openBatterySettings();
      }
    } catch {}
  }
};

// 后台保活设置：跳应用详情页，引导开启自启动/后台活动
window.openAppSettings = () => {
  if (Capacitor.isNativePlatform()) {
    try {
      if (window.ExternalBrowser && typeof window.ExternalBrowser.openAppSettings === 'function') {
        window.ExternalBrowser.openAppSettings();
      }
    } catch {}
  }
};

// 悬浮球保活：跳系统“悬浮窗”权限授权页
window.openOverlaySettings = () => {
  if (Capacitor.isNativePlatform()) {
    try {
      if (window.ExternalBrowser && typeof window.ExternalBrowser.openOverlaySettings === 'function') {
        window.ExternalBrowser.openOverlaySettings();
      }
    } catch {}
  }
};

// 悬浮球保活：开关
window.setFloatBall = (on) => {
  if (Capacitor.isNativePlatform()) {
    try {
      if (window.ExternalBrowser && typeof window.ExternalBrowser.setFloatBall === 'function') {
        window.ExternalBrowser.setFloatBall(!!on);
      }
    } catch {}
  }
};

window.isFloatBallEnabled = () => {
  if (Capacitor.isNativePlatform()) {
    try {
      if (window.ExternalBrowser && typeof window.ExternalBrowser.isFloatBallEnabled === 'function') {
        return !!window.ExternalBrowser.isFloatBallEnabled();
      }
    } catch {}
  }
  return false;
};
