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
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
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
  {
    label: "Login",
    icon: "log-in-outline" as const,
    url: `${MELINA_URL.replace(/\/$/, "")}/auth`,
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

  const isPlaygroundScreen = currentUrl.includes("/playground");

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
            />

            {(loading || refreshing) && (
              <View style={styles.loadingOverlay}>
                <ActivityIndicator color="#ffffff" />
              </View>
            )}

            {isPlaygroundScreen && (
              <>
                <Pressable
                  accessibilityLabel="Open menu"
                  style={styles.menuButton}
                  onPress={() => setDrawerOpen(true)}
                >
                  <Ionicons name="menu" size={24} color="#ffffff" />
                </Pressable>

                {drawerOpen && <Pressable style={styles.drawerBackdrop} onPress={() => setDrawerOpen(false)} />}

                <Animated.View
                  style={[
                    styles.drawer,
                    {
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
                  </View>
                </Animated.View>
              </>
            )}
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
  menuButton: {
    alignItems: "center",
    backgroundColor: "rgba(5,5,5,0.82)",
    borderColor: "rgba(255,255,255,0.12)",
    borderRadius: 12,
    borderWidth: 1,
    height: 44,
    justifyContent: "center",
    left: 14,
    position: "absolute",
    top: 14,
    width: 44,
    zIndex: 20
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
