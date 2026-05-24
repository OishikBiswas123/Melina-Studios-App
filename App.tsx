import { Ionicons } from "@expo/vector-icons";
import Constants from "expo-constants";
import * as Linking from "expo-linking";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  BackHandler,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View
} from "react-native";
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { WebView, WebViewNavigation } from "react-native-webview";
import type { WebView as WebViewType } from "react-native-webview";

SplashScreen.preventAutoHideAsync().catch(() => undefined);

const MELINA_URL =
  process.env.EXPO_PUBLIC_APP_URL ||
  (Constants.expoConfig?.extra?.appUrl as string | undefined) ||
  "https://melina.studio";

const APP_ENTRY_URL = `${MELINA_URL.replace(/\/$/, "")}/playground/all`;
const MELINA_HOSTS = new Set(["melina.studio", "www.melina.studio"]);
const DRAWER_WIDTH = 284;

const drawerItems = [
  {
    label: "Boards",
    icon: "grid-outline" as const,
    url: `${MELINA_URL.replace(/\/$/, "")}/playground/all`,
  },
  {
    label: "Settings",
    icon: "settings-outline" as const,
    url: `${MELINA_URL.replace(/\/$/, "")}/playground/settings`,
  },
];

function normalizeUrl(url: string) {
  if (url.startsWith("exp://") || url.startsWith("exps://")) {
    return APP_ENTRY_URL;
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
  return (
    <SafeAreaProvider>
      <AppContent />
    </SafeAreaProvider>
  );
}

function AppContent() {
  const insets = useSafeAreaInsets();
  const webViewRef = useRef<WebViewType>(null);
  const drawerTranslateX = useRef(new Animated.Value(-DRAWER_WIDTH)).current;
  const [targetUrl, setTargetUrl] = useState(APP_ENTRY_URL);
  const [currentUrl, setCurrentUrl] = useState(APP_ENTRY_URL);
  const [canGoBack, setCanGoBack] = useState(false);
  const [loading, setLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [themeMode, setThemeMode] = useState<"dark" | "light">("dark");

  useEffect(() => {
    async function loadInitialUrl() {
      const incomingUrl = await Linking.getInitialURL();
      setTargetUrl(
        incomingUrl && isRestorableUrl(incomingUrl) ? normalizeUrl(incomingUrl) : APP_ENTRY_URL
      );
    }

    loadInitialUrl().catch(() => setTargetUrl(APP_ENTRY_URL));
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
      if (drawerOpen) {
        setDrawerOpen(false);
        return true;
      }

      if (canGoBack) {
        webViewRef.current?.goBack();
        return true;
      }

      return false;
    });

    return () => subscription.remove();
  }, [canGoBack, drawerOpen]);

  useEffect(() => {
    Animated.timing(drawerTranslateX, {
      toValue: drawerOpen ? 0 : -DRAWER_WIDTH,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [drawerOpen, drawerTranslateX]);

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
        if (window.__melinaAppChromeInstalled) return true;
        window.__melinaAppChromeInstalled = true;

        const meta = document.querySelector('meta[name=viewport]');
        const viewport = 'width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover';
        if (meta) {
          meta.setAttribute('content', viewport);
        } else {
          const newMeta = document.createElement('meta');
          newMeta.name = 'viewport';
          newMeta.content = viewport;
          document.head.appendChild(newMeta);
        }
        document.documentElement.style.webkitUserSelect = 'none';
        document.documentElement.style.webkitTouchCallout = 'none';

        const style = document.createElement('style');
        style.id = 'melina-app-chrome-style';
        style.textContent = \`
          #melina-app-top,
          #melina-app-credit {
            box-sizing: border-box;
            font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          }

          #melina-app-top {
            display: none;
            width: 100%;
            padding: calc(env(safe-area-inset-top, 0px) + 14px) 16px 18px;
            background: color-mix(in srgb, Canvas 92%, transparent);
            border-bottom: 1px solid color-mix(in srgb, CanvasText 10%, transparent);
          }

          .dark #melina-app-top {
            background: rgba(5, 5, 5, 0.94);
          }

          #melina-app-top[data-visible="true"] {
            display: block;
          }

          #melina-app-top-inner {
            display: grid;
            grid-template-columns: 44px 1fr 44px;
            align-items: start;
            gap: 8px;
            width: 100%;
          }

          #melina-app-menu {
            width: 44px;
            height: 44px;
            border: 1px solid color-mix(in srgb, CanvasText 14%, transparent);
            border-radius: 12px;
            background: color-mix(in srgb, CanvasText 8%, transparent);
            color: CanvasText;
            font-size: 25px;
            font-weight: 800;
            line-height: 1;
          }

          #melina-app-brand {
            min-width: 0;
            text-align: center;
          }

          #melina-app-brand-row {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            margin-bottom: 7px;
          }

          #melina-app-logo {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 28px;
            height: 28px;
            border-radius: 8px;
            background: CanvasText;
            color: Canvas;
            font-size: 18px;
            font-weight: 900;
          }

          #melina-app-name {
            color: CanvasText;
            font-size: 18px;
            font-weight: 800;
            white-space: nowrap;
          }

          #melina-app-headline {
            color: CanvasText;
            font-size: clamp(28px, 8vw, 42px);
            font-weight: 900;
            line-height: 1.05;
            letter-spacing: 0;
            margin: 0;
          }

          #melina-app-subtitle {
            color: color-mix(in srgb, CanvasText 62%, transparent);
            font-size: 13px;
            font-weight: 600;
            line-height: 1.4;
            margin-top: 7px;
          }

          #melina-app-credit {
            display: none;
            width: 100%;
            padding: 12px 16px calc(env(safe-area-inset-bottom, 0px) + 12px);
            color: color-mix(in srgb, CanvasText 66%, transparent);
            background: color-mix(in srgb, Canvas 92%, transparent);
            border-top: 1px solid color-mix(in srgb, CanvasText 10%, transparent);
            font-size: 11px;
            font-weight: 650;
            line-height: 1.45;
            text-align: center;
          }

          .dark #melina-app-credit {
            background: rgba(5, 5, 5, 0.94);
          }

          #melina-app-credit[data-visible="true"] {
            display: block;
          }

          .melina-app-credit-link {
            border: 0;
            padding: 0;
            background: transparent;
            color: CanvasText;
            font: inherit;
            font-weight: 850;
            text-decoration: underline;
          }
        \`;
        document.head.appendChild(style);

        const top = document.createElement('div');
        top.id = 'melina-app-top';
        top.innerHTML = \`
          <div id="melina-app-top-inner">
            <button id="melina-app-menu" type="button" aria-label="Open menu">☰</button>
            <div id="melina-app-brand">
              <div id="melina-app-brand-row">
                <span id="melina-app-logo">M</span>
                <span id="melina-app-name">Melina Studios</span>
              </div>
              <h1 id="melina-app-headline">Cursor for Canvas</h1>
              <div id="melina-app-subtitle">Describe your intent. Melina handles the canvas.</div>
            </div>
            <span aria-hidden="true"></span>
          </div>
        \`;

        const credit = document.createElement('div');
        credit.id = 'melina-app-credit';
        credit.innerHTML = \`
          cooked by <button class="melina-app-credit-link" data-url="https://oishikbiswas.vercel.app/" type="button">Oishik Biswas</button>
          <span> | Owner of melina studios </span>
          <button class="melina-app-credit-link" data-url="https://aryan-shaw.netlify.app/" type="button">Aryan Shaw</button>
        \`;

        function syncChromeVisibility() {
          const visible = window.location.pathname.indexOf('/playground') === 0;
          top.dataset.visible = String(visible);
          credit.dataset.visible = String(visible);
        }

        function mountChrome() {
          if (!document.body.contains(top)) {
            document.body.insertBefore(top, document.body.firstChild);
          }
          if (!document.body.contains(credit)) {
            document.body.appendChild(credit);
          }
          syncChromeVisibility();
        }

        function postMessage(message) {
          window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify(message));
        }

        top.querySelector('#melina-app-menu').addEventListener('click', function() {
          postMessage({ type: 'openDrawer' });
        });

        credit.querySelectorAll('[data-url]').forEach(function(button) {
          button.addEventListener('click', function() {
            postMessage({ type: 'openExternal', url: button.getAttribute('data-url') });
          });
        });

        const pushState = history.pushState;
        history.pushState = function() {
          pushState.apply(history, arguments);
          setTimeout(syncChromeVisibility, 0);
        };
        const replaceState = history.replaceState;
        history.replaceState = function() {
          replaceState.apply(history, arguments);
          setTimeout(syncChromeVisibility, 0);
        };
        window.addEventListener('popstate', syncChromeVisibility);
        window.addEventListener('hashchange', syncChromeVisibility);

        if (document.body) {
          mountChrome();
        } else {
          document.addEventListener('DOMContentLoaded', mountChrome, { once: true });
        }

        try {
          const theme = localStorage.getItem('theme') || (document.documentElement.classList.contains('dark') ? 'dark' : 'light');
          window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'theme', value: theme }));
        } catch (error) {}
      })();
      true;
    `,
    []
  );

  const handleNavigation = useCallback((navState: WebViewNavigation) => {
    setCanGoBack(navState.canGoBack);
    setCurrentUrl(navState.url);
  }, []);

  const handleReload = useCallback(() => {
    setHasError(false);
    setLoadError("");
    setRefreshing(true);
    webViewRef.current?.reload();
  }, []);

  const navigateInApp = useCallback((url: string) => {
    setDrawerOpen(false);
    setHasError(false);
    setLoadError("");
    setTargetUrl(url);
  }, []);

  const toggleTheme = useCallback(() => {
    const nextTheme = themeMode === "dark" ? "light" : "dark";
    setThemeMode(nextTheme);
    setDrawerOpen(false);
    webViewRef.current?.injectJavaScript(`
      (function() {
        const theme = '${nextTheme}';
        localStorage.setItem('theme', theme);
        try {
          const settings = JSON.parse(localStorage.getItem('settings') || '{}');
          settings.theme = theme;
          localStorage.setItem('settings', JSON.stringify(settings));
        } catch (error) {}
        document.documentElement.classList.toggle('dark', theme === 'dark');
        document.documentElement.style.colorScheme = theme;
        window.dispatchEvent(new StorageEvent('storage', { key: 'theme', newValue: theme }));
      })();
      true;
    `);
  }, [themeMode]);

  const handleLogout = useCallback(() => {
    setDrawerOpen(false);
    setHasError(false);
    setLoadError("");
    webViewRef.current?.injectJavaScript(`
      (async function() {
        try {
          await fetch('${MELINA_URL.replace(/\/$/, "")}/api/v1/auth/logout', {
            method: 'POST',
            credentials: 'include'
          });
        } catch (error) {}
        window.location.href = '${MELINA_URL.replace(/\/$/, "")}/auth';
      })();
      true;
    `);
  }, []);

  const isPlaygroundScreen = currentUrl.includes("/playground");

  return (
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
              injectedJavaScriptBeforeContentLoaded={injectedJavaScript}
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
              onMessage={(event) => {
                try {
                  const message = JSON.parse(event.nativeEvent.data);
                  if (message.type === "theme" && (message.value === "dark" || message.value === "light")) {
                    setThemeMode(message.value);
                  }
                  if (message.type === "openDrawer") {
                    setDrawerOpen(true);
                  }
                  if (message.type === "openExternal" && typeof message.url === "string") {
                    Linking.openURL(message.url).catch(() => undefined);
                  }
                } catch {
                  // Ignore non-JSON messages from the webpage.
                }
              }}
            />

            {(loading || refreshing) && (
              <View style={styles.loadingOverlay}>
                <ActivityIndicator color="#ffffff" />
              </View>
            )}

            {isPlaygroundScreen && (
              <>
                {drawerOpen && <Pressable style={styles.drawerBackdrop} onPress={() => setDrawerOpen(false)} />}

                <Animated.View
                  style={[
                    styles.drawer,
                    {
                      paddingTop: Math.max(insets.top + 16, 24),
                      transform: [{ translateX: drawerTranslateX }],
                    },
                  ]}
                >
                  <View style={styles.drawerHeader}>
                    <View style={styles.drawerLogo}>
                      <Text style={styles.drawerLogoText}>M</Text>
                    </View>
                    <View>
                      <Text style={styles.drawerTitle}>Melina Studio</Text>
                      <Text style={styles.drawerSubtitle}>Workspace</Text>
                    </View>
                    <Pressable style={styles.drawerClose} onPress={() => setDrawerOpen(false)}>
                      <Ionicons name="close" size={20} color="#ffffff" />
                    </Pressable>
                  </View>

                  <View style={styles.drawerContent}>
                    {drawerItems.map((item) => {
                      const active = currentUrl.startsWith(item.url);
                      return (
                        <Pressable
                          key={item.label}
                          style={[styles.drawerItem, active && styles.drawerItemActive]}
                          onPress={() => navigateInApp(item.url)}
                        >
                          <Ionicons
                            name={item.icon}
                            size={20}
                            color={active ? "#ffffff" : "rgba(255,255,255,0.72)"}
                          />
                          <Text style={[styles.drawerItemText, active && styles.drawerItemTextActive]}>
                            {item.label}
                          </Text>
                        </Pressable>
                      );
                    })}

                    <Pressable style={styles.drawerItem} onPress={toggleTheme}>
                      <Ionicons
                        name={themeMode === "dark" ? "sunny-outline" : "moon-outline"}
                        size={20}
                        color="rgba(255,255,255,0.72)"
                      />
                      <Text style={styles.drawerItemText}>
                        {themeMode === "dark" ? "Light mode" : "Dark mode"}
                      </Text>
                    </Pressable>

                    <Pressable style={styles.drawerItem} onPress={handleLogout}>
                      <Ionicons name="log-out-outline" size={20} color="rgba(255,255,255,0.72)" />
                      <Text style={styles.drawerItemText}>Logout</Text>
                    </Pressable>
                  </View>
                </Animated.View>
              </>
            )}
          </>
        )}
      </SafeAreaView>
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
  drawerBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.42)",
    zIndex: 24
  },
  drawer: {
    backgroundColor: "#050505",
    borderRightColor: "rgba(255,255,255,0.1)",
    borderRightWidth: 1,
    bottom: 0,
    left: 0,
    paddingHorizontal: 14,
    paddingTop: 18,
    position: "absolute",
    top: 0,
    width: DRAWER_WIDTH,
    zIndex: 25
  },
  drawerHeader: {
    alignItems: "center",
    borderBottomColor: "rgba(255,255,255,0.1)",
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 12,
    paddingBottom: 16
  },
  drawerLogo: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderRadius: 10,
    height: 42,
    justifyContent: "center",
    width: 42
  },
  drawerLogoText: {
    color: "#050505",
    fontSize: 24,
    fontWeight: "700"
  },
  drawerTitle: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700"
  },
  drawerSubtitle: {
    color: "rgba(255,255,255,0.56)",
    fontSize: 12,
    marginTop: 2
  },
  drawerClose: {
    alignItems: "center",
    height: 36,
    justifyContent: "center",
    marginLeft: "auto",
    width: 36
  },
  drawerContent: {
    gap: 6,
    paddingTop: 18
  },
  drawerItem: {
    alignItems: "center",
    borderRadius: 10,
    flexDirection: "row",
    gap: 12,
    minHeight: 44,
    paddingHorizontal: 12
  },
  drawerItemActive: {
    backgroundColor: "rgba(255,255,255,0.12)"
  },
  drawerItemText: {
    color: "rgba(255,255,255,0.72)",
    fontSize: 15,
    fontWeight: "600"
  },
  drawerItemTextActive: {
    color: "#ffffff"
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
