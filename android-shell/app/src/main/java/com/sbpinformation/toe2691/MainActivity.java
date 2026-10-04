package com.sbpinformation.toe2691;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

public class MainActivity extends Activity {
    private static final String APP_HOST = "sinevbogdan100-jpg.github.io";
    private static final String APP_PATH = "/college2026grouponecurs.com/";
    private static final String APP_URL = "https://" + APP_HOST + APP_PATH + "?source=android-app&launch=1";
    private static final int FILE_CHOOSER_REQUEST = 4102;
    private WebView webView;
    private ValueCallback<Uri[]> filePathCallback;

    @Override protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(Color.rgb(93,72,207));
        getWindow().setNavigationBarColor(Color.rgb(127,201,238));
        webView = new WebView(this);
        webView.setBackgroundColor(Color.rgb(248,250,252));
        setContentView(webView);
        WebView.setWebContentsDebuggingEnabled(false);
        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        s.setSupportMultipleWindows(false);
        s.setUserAgentString(s.getUserAgentString()+" SBPInformationAndroid/"+BuildConfig.VERSION_NAME);
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView,true);
        webView.addJavascriptInterface(new AndroidBridge(),"SBPAndroid");
        webView.setWebViewClient(new WebViewClient(){
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request){
                Uri uri=request.getUrl(); if(isInternalUrl(uri)) return false; openExternal(uri); return true;
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view,String url){
                Uri uri=Uri.parse(url); if(isInternalUrl(uri)) return false; openExternal(uri); return true;
            }
        });
        webView.setWebChromeClient(new WebChromeClient(){
            @Override public boolean onShowFileChooser(WebView view,ValueCallback<Uri[]> callback,FileChooserParams params){
                if(filePathCallback!=null) filePathCallback.onReceiveValue(null);
                filePathCallback=callback;
                try{startActivityForResult(params.createIntent(),FILE_CHOOSER_REQUEST);return true;}
                catch(ActivityNotFoundException e){filePathCallback=null;Toast.makeText(MainActivity.this,"Не удалось открыть выбор файла",Toast.LENGTH_SHORT).show();return false;}
            }
        });
        if(savedInstanceState==null) webView.loadUrl(APP_URL); else webView.restoreState(savedInstanceState);
    }
    private boolean isInternalUrl(Uri uri){
        return "https".equalsIgnoreCase(uri.getScheme())&&APP_HOST.equalsIgnoreCase(uri.getHost())&&uri.getPath()!=null&&uri.getPath().startsWith(APP_PATH);
    }
    private void openExternal(Uri uri){
        if(uri==null)return;
        try{startActivity(new Intent(Intent.ACTION_VIEW,uri));}
        catch(ActivityNotFoundException e){Toast.makeText(this,"Не удалось открыть ссылку",Toast.LENGTH_SHORT).show();}
    }
    @Override protected void onSaveInstanceState(Bundle outState){webView.saveState(outState);super.onSaveInstanceState(outState);}
    @Override public void onBackPressed(){if(webView!=null&&webView.canGoBack())webView.goBack();else super.onBackPressed();}
    @Override protected void onActivityResult(int requestCode,int resultCode,Intent data){
        if(requestCode==FILE_CHOOSER_REQUEST&&filePathCallback!=null){
            Uri[] result=WebChromeClient.FileChooserParams.parseResult(resultCode,data);
            filePathCallback.onReceiveValue(result);filePathCallback=null;return;
        }
        super.onActivityResult(requestCode,resultCode,data);
    }
    @Override protected void onDestroy(){if(webView!=null){webView.removeJavascriptInterface("SBPAndroid");webView.destroy();}super.onDestroy();}
    public class AndroidBridge{
        @JavascriptInterface public boolean isNativeApp(){return true;}
        @JavascriptInterface public int getVersionCode(){return BuildConfig.VERSION_CODE;}
        @JavascriptInterface public String getVersionName(){return BuildConfig.VERSION_NAME;}
        @JavascriptInterface public void openUpdate(String url){
            runOnUiThread(()->{
                try{
                    Uri uri=Uri.parse(url);
                    if(!"https".equalsIgnoreCase(uri.getScheme()))return;
                    String host=uri.getHost();
                    if(host==null||!(host.equalsIgnoreCase("github.com")||host.endsWith(".github.com")))return;
                    openExternal(uri);
                }catch(Exception ignored){}
            });
        }
    }
}
