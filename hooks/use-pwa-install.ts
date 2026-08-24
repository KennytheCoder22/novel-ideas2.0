import { useCallback, useEffect, useState } from "react";
import { Alert, Platform } from "react-native";

import { isIosBrowser, isStandalonePwa, rememberPwaLaunchPath } from "@/lib/pwaRuntime";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

export function usePwaInstall() {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [standalone, setStandalone] = useState(() => isStandalonePwa());

  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;

    const displayMode = window.matchMedia("(display-mode: standalone)");
    const updateStandalone = () => setStandalone(isStandalonePwa());
    const captureInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    const handleInstalled = () => {
      setInstallPrompt(null);
      setStandalone(true);
    };

    window.addEventListener("beforeinstallprompt", captureInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);
    displayMode.addEventListener?.("change", updateStandalone);

    return () => {
      window.removeEventListener("beforeinstallprompt", captureInstallPrompt);
      window.removeEventListener("appinstalled", handleInstalled);
      displayMode.removeEventListener?.("change", updateStandalone);
    };
  }, []);

  const install = useCallback(async () => {
    rememberPwaLaunchPath();

    if (installPrompt) {
      try {
        await installPrompt.prompt();
        await installPrompt.userChoice;
        setInstallPrompt(null);
      } catch {
        Alert.alert("Unable to install NovelIdeas", "Open your browser menu and choose Install NovelIdeas.");
      }
      return;
    }

    if (isIosBrowser()) {
      Alert.alert(
        "Install NovelIdeas",
        "Tap the Share button in Safari, then choose Add to Home Screen.",
      );
      return;
    }

    Alert.alert(
      "Install NovelIdeas",
      "Open your browser menu and choose Install NovelIdeas or Add to Home Screen.",
    );
  }, [installPrompt]);

  return {
    install,
    shouldShowInstall: Platform.OS === "web" && !standalone,
  };
}
