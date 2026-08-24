import { type PropsWithChildren } from "react";
import { ScrollViewStyleReset } from "expo-router/html";

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="theme-color" content="#07182b" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="Novel Ideas" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function () {
                var pathParts = window.location.pathname.split("/").filter(Boolean);
                var reservedPaths = {
                  "__pwa_launch__": true,
                  "about": true,
                  "admin": true,
                  "admin-collection": true,
                  "app_admin-web": true,
                  "customize-my-experience": true,
                  "feedback": true,
                  "how-it-works": true,
                  "privacy": true,
                  "swipe": true,
                  "testing": true
                };
                var libraryId = null;
                if (pathParts.length === 1 && /^[A-Za-z0-9_-]+$/.test(pathParts[0]) && !reservedPaths[pathParts[0]]) {
                  libraryId = pathParts[0];
                } else if (pathParts.length === 2 && pathParts[0] === "c" && /^[A-Za-z0-9_-]+$/.test(pathParts[1])) {
                  libraryId = pathParts[1];
                }
                var encodedId = libraryId ? encodeURIComponent(libraryId) : "";
                var manifest = document.createElement("link");
                manifest.rel = "manifest";
                manifest.href = libraryId
                  ? "/api/library-config?libraryId=" + encodedId + "&format=pwa-manifest"
                  : "/manifest.webmanifest";
                document.head.appendChild(manifest);
                var appleIcon = document.createElement("link");
                appleIcon.rel = "apple-touch-icon";
                appleIcon.href = libraryId
                  ? "/api/library-config?libraryId=" + encodedId + "&format=pwa-icon&size=180&purpose=any"
                  : "/icons/apple-touch-icon.png";
                document.head.appendChild(appleIcon);
              })();

              if (window.location.pathname === "/__pwa_launch__") {
                try {
                  var launchPath = window.localStorage.getItem("novelideas:pwa-launch-path") || "/";
                  var isValidLaunchPath = launchPath === "/"
                    || /^\\/[A-Za-z0-9_-]+\\/?(?:\\?[^#]*)?$/.test(launchPath);
                  window.location.replace(isValidLaunchPath ? launchPath : "/");
                } catch (error) {
                  window.location.replace("/");
                }
              }
            `,
          }}
        />
        <ScrollViewStyleReset />
        <style
          dangerouslySetInnerHTML={{
            __html: `
              html, body {
                margin: 0;
                background: #07182b;
              }
              body {
                padding-top: env(safe-area-inset-top);
                padding-right: env(safe-area-inset-right);
                padding-bottom: env(safe-area-inset-bottom);
                padding-left: env(safe-area-inset-left);
                min-height: 100vh;
              }
              #root {
                min-height: calc(100vh - env(safe-area-inset-top) - env(safe-area-inset-bottom));
              }
            `,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
