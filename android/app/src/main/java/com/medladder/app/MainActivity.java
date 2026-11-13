package com.medladder.app;

import android.app.DownloadManager;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.os.Environment;
import android.webkit.DownloadListener;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.widget.Toast;
import androidx.activity.EdgeToEdge;
import androidx.core.splashscreen.SplashScreen;
import android.graphics.Color;
import android.os.SystemClock;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;
import com.google.firebase.analytics.FirebaseAnalytics;
import org.json.JSONObject;
import java.util.Iterator;

public class MainActivity extends BridgeActivity {

    private FirebaseAnalytics mFirebaseAnalytics;
    private volatile boolean webReady = false;

    public class NativeBridge {
        @android.webkit.JavascriptInterface
        public void downloadApk(String downloadUrl) {
            runOnUiThread(() -> triggerNativeDownload(downloadUrl));
        }

        @android.webkit.JavascriptInterface
        public void logEvent(String eventName, String paramsJson) {
            try {
                Bundle bundle = new Bundle();
                if (paramsJson != null && !paramsJson.isEmpty()) {
                    JSONObject obj = new JSONObject(paramsJson);
                    Iterator<String> keys = obj.keys();
                    while (keys.hasNext()) {
                        String k = keys.next();
                        bundle.putString(k, obj.optString(k));
                    }
                }
                if (mFirebaseAnalytics != null) {
                    mFirebaseAnalytics.logEvent(eventName, bundle);
                }
            } catch (Exception ignored) {}
        }

        @android.webkit.JavascriptInterface
        public void showToast(String message) {
            runOnUiThread(() -> Toast.makeText(MainActivity.this, message, Toast.LENGTH_SHORT).show());
        }

        /** Colour behind the status/navigation bars, matched to the page's theme. */
        @android.webkit.JavascriptInterface
        public void setBarsColor(String hex) {
            try {
                final int color = Color.parseColor(hex);
                runOnUiThread(() -> applyBarsColor(color));
            } catch (Exception ignored) {}
        }

        @android.webkit.JavascriptInterface
        public void exitApp() {
            runOnUiThread(() -> finishAffinity());
        }
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Native splash: hold it until the first page has painted (max ~3 s).
        SplashScreen splash = SplashScreen.installSplashScreen(this);
        final long splashStart = SystemClock.uptimeMillis();
        splash.setKeepOnScreenCondition(() -> !webReady && SystemClock.uptimeMillis() - splashStart < 3000);

        super.onCreate(savedInstanceState);
        // Edge-to-edge on every Android version (Play recommendation). Must run AFTER
        // super.onCreate so the window is created with the app theme, not the launch theme.
        // Capacitor's SystemBars pads the WebView so content never sits under the bars.
        EdgeToEdge.enable(this);
        applyBarsColor(Color.parseColor("#0d1033"));
        try {
            mFirebaseAnalytics = FirebaseAnalytics.getInstance(this);
        } catch (Exception ignored) {}
        setupDownloadBridge();
        setupUpiIntentHandler();
    }

    private void applyBarsColor(int color) {
        try {
            getWindow().getDecorView().setBackgroundColor(color);
            if (getBridge() != null && getBridge().getWebView() != null) {
                getBridge().getWebView().setBackgroundColor(color);
            }
        } catch (Exception ignored) {}
    }

    @Override
    public void onStart() {
        super.onStart();
        setupDownloadBridge();
        setupUpiIntentHandler();
    }

    @Override
    public void onResume() {
        super.onResume();
        setupDownloadBridge();
        setupUpiIntentHandler();
    }

    /**
     * Lets Razorpay's UPI flow and external social links work inside the app's WebView.
     *
     * 1. Strips '; wv' and 'Version/X.X' so Razorpay detects standard Chrome on Android
     *    and renders the UPI payment methods instead of suppressing them.
     * 2. Catches upi://, intent://, tez://, phonepe://, paytmmp://, etc. and dispatches
     *    them to installed UPI apps via Android's Intent system.
     * 3. Dispatches external social links (FB, Instagram, X, Telegram) to external apps/browser.
     */
    private void setupUpiIntentHandler() {
        try {
            if (getBridge() == null || getBridge().getWebView() == null) return;

            // Strip WebView markers from User-Agent so Razorpay unlocks UPI Intent
            WebSettings settings = getBridge().getWebView().getSettings();
            if (settings != null) {
                String ua = settings.getUserAgentString();
                if (ua != null && (ua.contains("; wv") || ua.contains("Version/"))) {
                    String cleanUa = ua.replace("; wv", "").replaceAll("Version/\\d+\\.\\d+\\s*", "");
                    settings.setUserAgentString(cleanUa);
                }
            }

            getBridge().getWebView().setWebViewClient(new BridgeWebViewClient(getBridge()) {
                @Override
                public void onPageFinished(WebView view, String url) {
                    super.onPageFinished(view, url);
                    webReady = true;
                }

                @Override
                public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                    return handleUpiIntent(view, request.getUrl().toString())
                            || super.shouldOverrideUrlLoading(view, request);
                }

                @Override
                @SuppressWarnings("deprecation")
                public boolean shouldOverrideUrlLoading(WebView view, String url) {
                    return handleUpiIntent(view, url)
                            || super.shouldOverrideUrlLoading(view, url);
                }

                private boolean handleUpiIntent(WebView view, String url) {
                    if (url == null) return false;

                    // 1. Direct UPI / wallet schemes
                    if (url.startsWith("upi://") || url.startsWith("tez://") || url.startsWith("phonepe://")
                            || url.startsWith("paytmmp://") || url.startsWith("credpay://") || url.startsWith("bhim://")) {
                        try {
                            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                            view.getContext().startActivity(intent);
                            return true;
                        } catch (Exception e) {
                            e.printStackTrace();
                            return false;
                        }
                    }

                    // 2. Android intent:// scheme (used by Razorpay for UPI apps)
                    if (url.startsWith("intent://")) {
                        try {
                            Intent intent = Intent.parseUri(url, Intent.URI_INTENT_SCHEME);
                            intent.addCategory(Intent.CATEGORY_BROWSABLE);
                            intent.setComponent(null);
                            intent.setSelector(null);
                            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);

                            if (view.getContext().getPackageManager().resolveActivity(intent, 0) != null) {
                                view.getContext().startActivity(intent);
                                return true;
                            }

                            String fallbackUrl = intent.getStringExtra("browser_fallback_url");
                            if (fallbackUrl != null && !fallbackUrl.isEmpty()) {
                                view.loadUrl(fallbackUrl);
                                return true;
                            }
                            return false;
                        } catch (Exception e) {
                            e.printStackTrace();
                            return false;
                        }
                    }

                    // 3. External social & community links (open outside the WebView)
                    if (url.startsWith("https://www.facebook.com/") || url.startsWith("https://facebook.com/")
                            || url.startsWith("https://www.instagram.com/") || url.startsWith("https://instagram.com/")
                            || url.startsWith("https://x.com/") || url.startsWith("https://twitter.com/")
                            || url.startsWith("https://t.me/") || url.startsWith("https://telegram.me/")) {
                        try {
                            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                            view.getContext().startActivity(intent);
                            return true;
                        } catch (Exception e) {
                            e.printStackTrace();
                            return false;
                        }
                    }

                    return false;
                }
            });
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    private void setupDownloadBridge() {
        try {
            if (getBridge() != null && getBridge().getWebView() != null) {
                // Direct JS bridge to trigger download without touching navigation or WebView screen
                getBridge().getWebView().addJavascriptInterface(new NativeBridge(), "MedLadderAndroidApp");

                // Also attach standard DownloadListener as secondary fallback
                getBridge().getWebView().setDownloadListener(new DownloadListener() {
                    @Override
                    public void onDownloadStart(String url, String userAgent, String contentDisposition, String mimetype, long contentLength) {
                        triggerNativeDownload(url);
                    }
                });
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    private void triggerNativeDownload(String urlString) {
        String url = (urlString != null && !urlString.isEmpty()) ? urlString : "https://medladder.top/MedLadder-latest.apk";
        try {
            DownloadManager dm = (DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE);
            if (dm != null) {
                DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
                request.setMimeType("application/vnd.android.package-archive");
                request.setDescription("Downloading MedLadder update...");
                String filename = "MedLadder-latest.apk";
                request.setTitle(filename);
                request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, filename);
                dm.enqueue(request);
                Toast.makeText(getApplicationContext(), "📥 Downloading " + filename + " in background...", Toast.LENGTH_LONG).show();
            }
        } catch (Exception ex) {
            Toast.makeText(getApplicationContext(), "Download error: " + ex.getMessage(), Toast.LENGTH_SHORT).show();
        }
    }
}
