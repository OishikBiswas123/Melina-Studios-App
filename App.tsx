import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as Linking from "expo-linking";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  BackHandler,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { WebView, WebViewNavigation } from "react-native-webview";
import type { WebView as WebViewType } from "react-native-webview";

SplashScreen.preventAutoHideAsync().catch(() => undefined);

const MELINA_URL =
  process.env.EXPO_PUBLIC_APP_URL ||
  (Constants.expoConfig?.extra?.appUrl as string | undefined) ||
  "https://melina.studio";

const LAST_URL_KEY = "melina:last-url";
const MELINA_HOSTS = new Set(["melina.studio", "www.melina.studio"]);

function normalizeUrl(url: string) {
  if (url.startsWith("exp://") || url.startsWith("exps://")) {
    return MELINA_URL;
  }

  if (url.startsWith("melina://")) {
    const parsed = Linking.parse(url);
    const path = parsed.path ? `/${parsed.path}` : "/";
    return `${MELINA_URL.replace(/\/$/, "")}${path}`;
  }

  return url;
}

function isRestorableUrl(url: string | null) {
  if (!url) return false;
  if (url.startsWith("exp://") || url.startsWith("exps://")) return false;
  if (url.startsWith("melina://")) return true;

  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

function isAllowedNavigation(url: string) {
  if (url.startsWith("about:blank")) return true;
  if (url.startsWith("melina://")) return true;

  try {
    const parsed = new URL(url);
    if (parsed.protocol === "https:" || parsed.protocol === "http:") return true;
  } catch {
    return false;
  }

  return false;
}

function isMainMelinaUrl(url: string) {
  try {
    const parsed = new URL(url);
    return MELINA_HOSTS.has(parsed.hostname);
  } catch {
    return false;
  }
}

export default function App() {
  const webViewRef = useRef<WebViewType>(null);
  const [targetUrl, setTargetUrl] = useState(MELINA_URL);
  const [currentUrl, setCurrentUrl] = useState(MELINA_URL);
  const [canGoBack, setCanGoBack] = useState(false);
  const [loading, setLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    async function restoreLastUrl() {
      const incomingUrl = await Linking.getInitialURL();
      const savedUrl = await AsyncStorage.getItem(LAST_URL_KEY);
      const restorableUrl = isRestorableUrl(incomingUrl) ? incomingUrl : savedUrl;
      setTargetUrl(normalizeUrl(restorableUrl || MELINA_URL));
    }

    restoreLastUrl().catch(() => setTargetUrl(MELINA_URL));
  }, []);

  useEffect(() => {
    const subscription = Linking.addEventListener("url", ({ url }) => {
      if (!isRestorableUrl(url)) return;
      setTargetUrl(normalizeUrl(url));
    });

    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (Platform.OS !== "android") return;

    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      if (canGoBack) {
        webViewRef.current?.goBack();
        return true;
      }

      return false;
    });

    return () => subscription.remove();
  }, [canGoBack]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setLoading(false);
      setRefreshing(false);
      SplashScreen.hideAsync().catch(() => undefined);
    }, 8000);

    return () => clearTimeout(timeout);
  }, [targetUrl]);

  const injectedJavaScript = useMemo(
    () => `
      (function() {
        const meta = document.querySelector('meta[name=viewport]');
        if (meta) {
          meta.setAttribute('content', 'width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover');
        }
        document.documentElement.style.webkitUserSelect = 'none';
        document.documentElement.style.webkitTouchCallout = 'none';
      })();
      true;
    `,
    []
  );

  const handleNavigation = useCallback((navState: WebViewNavigation) => {
    setCanGoBack(navState.canGoBack);
    setCurrentUrl(navState.url);

    if (navState.url.startsWith(MELINA_URL)) {
      AsyncStorage.setItem(LAST_URL_KEY, navState.url).catch(() => undefined);
    }
  }, []);

  const handleReload = useCallback(() => {
    setHasError(false);
    setLoadError("");
    setRefreshing(true);
    webViewRef.current?.reload();
  }, []);

  const handleHome = useCallback(() => {
    setHasError(false);
    setLoadError("");
    setTargetUrl(MELINA_URL);
  }, []);

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.root}>
        <StatusBar style="light" backgroundColor="#050505" />

        {hasError ? (
          <View style={styles.errorScreen}>
            <View style={styles.brandMark}>
              <Text style={styles.brandLetter}>M</Text>
            </View>
            <Text style={styles.errorTitle}>Melina Studio could not load</Text>
            <Text style={styles.errorText}>
              Check the connection, then reload. The app will reconnect to the same Melina website
              and backend.
            </Text>
            {loadError ? <Text style={styles.errorDetail}>{loadError}</Text> : null}
            <Pressable style={styles.primaryButton} onPress={handleReload}>
              <Ionicons name="refresh" size={18} color="#050505" />
              <Text style={styles.primaryButtonText}>Reload</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <WebView
              ref={webViewRef}
              source={{ uri: targetUrl }}
              style={styles.webview}
              originWhitelist={["https://*", "http://*", "melina://*"]}
              javaScriptEnabled
              domStorageEnabled
              sharedCookiesEnabled
              thirdPartyCookiesEnabled
              allowsBackForwardNavigationGestures
              mediaPlaybackRequiresUserAction={false}
              pullToRefreshEnabled
              mixedContentMode="always"
              setSupportMultipleWindows={false}
              androidLayerType="hardware"
              userAgent="Mozilla/5.0 (Linux; Android 13; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36 MelinaStudioApp/0.1"
              injectedJavaScript={injectedJavaScript}
              onNavigationStateChange={handleNavigation}
              onLoadStart={() => {
                setLoading(true);
                setLoadError("");
              }}
              onLoadProgress={(event) => {
                if (event.nativeEvent.progress > 0.85) {
                  setLoading(false);
                  setRefreshing(false);
                  SplashScreen.hideAsync().catch(() => undefined);
                }
              }}
              onLoadEnd={() => {
                setLoading(false);
                setRefreshing(false);
                SplashScreen.hideAsync().catch(() => undefined);
              }}
              onError={(event) => {
                const { code, description, url } = event.nativeEvent;
                setLoading(false);
                setRefreshing(false);
                setLoadError(`${description || "Unknown error"} (${code})\n${url || targetUrl}`);
                setHasError(true);
                SplashScreen.hideAsync().catch(() => undefined);
              }}
              onHttpError={(event) => {
                const { statusCode, description, url } = event.nativeEvent;
                if (statusCode >= 500 && isMainMelinaUrl(url)) {
                  setLoadError(`${description || "HTTP error"} (${statusCode})\n${url}`);
                  setHasError(true);
                }
              }}
              onShouldStartLoadWithRequest={(request) => {
                if (isAllowedNavigation(request.url)) return true;
                Linking.openURL(request.url).catch(() => undefined);
                return false;
              }}
            />

            {(loading || refreshing) && (
              <View style={styles.loadingOverlay}>
                <ActivityIndicator color="#ffffff" />
              </View>
            )}

            <View style={styles.nativeBar}>
              <Pressable
                accessibilityLabel="Back"
                disabled={!canGoBack}
                style={[styles.iconButton, !canGoBack && styles.iconButtonDisabled]}
                onPress={() => webViewRef.current?.goBack()}
              >
                <Ionicons name="chevron-back" size={20} color="#ffffff" />
              </Pressable>
              <Text numberOfLines={1} style={styles.urlText}>
                {currentUrl.replace(/^https?:\/\//, "")}
              </Text>
              <Pressable accessibilityLabel="Home" style={styles.iconButton} onPress={handleHome}>
                <Ionicons name="home-outline" size={18} color="#ffffff" />
              </Pressable>
              <Pressable
                accessibilityLabel="Reload"
                style={styles.iconButton}
                onPress={handleReload}
              >
                <Ionicons name="refresh" size={18} color="#ffffff" />
              </Pressable>
            </View>
          </>
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#050505"
  },
  webview: {
    flex: 1,
    backgroundColor: "#050505"
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    backgroundColor: "rgba(5,5,5,0.45)",
    justifyContent: "center"
  },
  nativeBar: {
    alignItems: "center",
    backgroundColor: "#050505",
    borderTopColor: "rgba(255,255,255,0.08)",
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 8,
    minHeight: 48,
    paddingHorizontal: 10
  },
  iconButton: {
    alignItems: "center",
    borderRadius: 8,
    height: 36,
    justifyContent: "center",
    width: 36
  },
  iconButtonDisabled: {
    opacity: 0.35
  },
  urlText: {
    color: "rgba(255,255,255,0.68)",
    flex: 1,
    fontSize: 12
  },
  errorScreen: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    padding: 28
  },
  brandMark: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderRadius: 16,
    height: 64,
    justifyContent: "center",
    marginBottom: 24,
    width: 64
  },
  brandLetter: {
    color: "#050505",
    fontSize: 32,
    fontWeight: "700"
  },
  errorTitle: {
    color: "#ffffff",
    fontSize: 22,
    fontWeight: "700",
    marginBottom: 10,
    textAlign: "center"
  },
  errorText: {
    color: "rgba(255,255,255,0.68)",
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 24,
    textAlign: "center"
  },
  errorDetail: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 8,
    color: "rgba(255,255,255,0.78)",
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 20,
    padding: 12,
    textAlign: "center",
    width: "100%"
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderRadius: 8,
    flexDirection: "row",
    gap: 8,
    minHeight: 44,
    paddingHorizontal: 18
  },
  primaryButtonText: {
    color: "#050505",
    fontSize: 15,
    fontWeight: "700"
  }
});
