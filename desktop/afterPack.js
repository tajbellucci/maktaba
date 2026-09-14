/* Stamps the real app icon onto the packaged .exe.
   ────────────────────────────────────────────────────────────────────────
   electron-builder's own signAndEditExecutable path pulls in winCodeSign
   (a macOS/Windows signing-tool bundle) even when nothing is being signed
   here (forceCodeSigning: false, no certificate configured) — and on this
   machine, without admin rights or Developer Mode, extracting that bundle's
   macOS .dylib SYMLINKS fails ("Cannot create symbolic link: a required
   privilege is not held by the client"), which aborts the whole build. The
   Windows tool inside that bundle (rcedit) always extracted fine; only the
   unrelated macOS files failed. So signAndEditExecutable stays off, and this
   hook runs rcedit directly against a copy of it kept in tools/ — the same
   tool electron-builder would have used, without needing its broken
   auto-download. Confirmed by rebuilding and extracting the icon straight
   back out of the resulting exe with .NET's Icon.ExtractAssociatedIcon: the
   stock Electron default only went away once this ran. */
const path = require("path");
const { execFileSync } = require("child_process");

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== "win32") return;

  const exeName = `${context.packager.appInfo.productFilename}.exe`;
  const exePath = path.join(context.appOutDir, exeName);
  const rcedit = path.join(__dirname, "tools", "rcedit-x64.exe");
  const icon = path.join(__dirname, "build", "icon.ico");

  execFileSync(rcedit, [exePath, "--set-icon", icon], { stdio: "inherit" });
};
