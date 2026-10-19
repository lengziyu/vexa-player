import { app, nativeImage, type NativeImage } from "electron";
import { join } from "node:path";

export const APP_NAME = "Vexa Player";
export const APP_ID = "com.vexa.player";

export function brandAsset(name: string): string {
  return join(app.getAppPath(), "resources/branding", name);
}

export function applicationIcon(): NativeImage {
  return nativeImage.createFromPath(
    brandAsset(process.platform === "win32" ? "icon.ico" : "icon.png"),
  );
}

export function trayIcon(): NativeImage {
  if (process.platform !== "darwin") return applicationIcon();
  const image = nativeImage.createFromPath(brandAsset("trayTemplate.png"));
  image.setTemplateImage(true);
  return image;
}
