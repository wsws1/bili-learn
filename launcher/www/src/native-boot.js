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
