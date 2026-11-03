package il.co.eitan_m.eitanpdf;

import android.content.ClipData;
import android.content.ContentResolver;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Parcelable;
import android.provider.DocumentsContract;
import android.provider.OpenableColumns;
import android.util.Base64;
import androidx.core.content.FileProvider;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Logger;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * קבצים באנדרואיד: בחירת PDF מתוך האפליקציה, קבלת קבצים מ"פתח באמצעות" / "שתף",
 * ושמירה — מעל המקור, "שמור בשם", לתיקייה ושיתוף.
 *
 * כל קובץ מועתק לתיקיית המטמון של האפליקציה, והממשק קורא אותו משם (בלי להעביר
 * מגה-בייטים דרך הגשר כ-Base64). כתובת המקור (content://) נשמרת יחד איתו, כדי
 * שאפשר יהיה לשמור מעליו כשהאפליקציה ששלחה אותו מרשה לכתוב.
 */
@CapacitorPlugin(name = "EitanFiles")
public class EitanFilesPlugin extends Plugin {

    private static final String HANDLED = "il.co.eitan_m.eitanpdf.HANDLED";
    private final ExecutorService io = Executors.newSingleThreadExecutor();

    @Override
    public void load() {
        // ניקוי קבצים זמניים מהפעלות קודמות
        deleteTree(incomingDir());
        deleteTree(outDir());
    }

    private File outDir() {
        File d = new File(getContext().getCacheDir(), "out");
        if (!d.exists()) d.mkdirs();
        return d;
    }

    private File incomingDir() {
        File d = new File(getContext().getCacheDir(), "incoming");
        if (!d.exists()) d.mkdirs();
        return d;
    }

    private static void deleteTree(File f) {
        File[] kids = f.listFiles();
        if (kids != null) for (File k : kids) deleteTree(k);
        f.delete();
    }

    /* ---------- בחירה מתוך האפליקציה ---------- */

    @PluginMethod
    public void pickPdf(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("application/pdf");
        intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, call.getBoolean("multiple", false));
        intent.addFlags(
            Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION
        );
        startActivityForResult(call, intent, "pickResult");
    }

    @ActivityCallback
    private void pickResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        Intent data = result.getData();
        if (result.getResultCode() != android.app.Activity.RESULT_OK || data == null) {
            JSObject ret = new JSObject();
            ret.put("files", new JSArray());
            call.resolve(ret);
            return;
        }
        List<Uri> uris = new ArrayList<>();
        ClipData clip = data.getClipData();
        if (clip != null) {
            for (int i = 0; i < clip.getItemCount(); i++) uris.add(clip.getItemAt(i).getUri());
        } else if (data.getData() != null) {
            uris.add(data.getData());
        }
        for (Uri u : uris) keepPermission(u);
        io.execute(() -> {
            try {
                JSObject ret = new JSObject();
                ret.put("files", importAll(uris));
                call.resolve(ret);
            } catch (Exception e) {
                Logger.error("EitanFiles", "pick", e);
                call.reject("קריאת הקובץ נכשלה", e);
            }
        });
    }

    /** הרשאה קבועה לקובץ שנבחר — כדי שאפשר יהיה לשמור מעליו גם אחר כך */
    private void keepPermission(Uri uri) {
        ContentResolver cr = getContext().getContentResolver();
        try {
            cr.takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
        } catch (SecurityException e) {
            try {
                cr.takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION);
            } catch (SecurityException ignored) {
                // ספק שלא תומך בהרשאה קבועה — ההרשאה הזמנית מספיקה לפתיחה
            }
        }
    }

    /* ---------- "פתח באמצעות" / "שתף" ---------- */

    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        if (intent == null || intent.getBooleanExtra(HANDLED, false)) return;
        if ((intent.getFlags() & Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY) != 0) return;
        String action = intent.getAction();
        List<Uri> uris = new ArrayList<>();
        if (Intent.ACTION_VIEW.equals(action) && intent.getData() != null) {
            uris.add(intent.getData());
        } else if (Intent.ACTION_SEND.equals(action)) {
            Uri u = streamExtra(intent);
            if (u != null) uris.add(u);
            else if (intent.getClipData() != null && intent.getClipData().getItemCount() > 0) uris.add(intent.getClipData().getItemAt(0).getUri());
        } else if (Intent.ACTION_SEND_MULTIPLE.equals(action)) {
            ArrayList<Uri> list = streamListExtra(intent);
            if (list != null) uris.addAll(list);
        }
        uris.removeIf((u) -> u == null);
        if (uris.isEmpty()) return;
        intent.putExtra(HANDLED, true);

        JSObject start = new JSObject();
        start.put("count", uris.size());
        notifyListeners("filesIncoming", start, true);
        io.execute(() -> {
            JSObject ev = new JSObject();
            try {
                // writable נקבע לפי ההרשאה שהאפליקציה השולחת נתנה בפועל
                ev.put("files", importAll(uris));
            } catch (Exception e) {
                Logger.error("EitanFiles", "incoming", e);
                ev.put("error", e.getMessage() != null ? e.getMessage() : "error");
            }
            notifyListeners("filesReceived", ev, true);
        });
    }

    @SuppressWarnings("deprecation")
    private static Uri streamExtra(Intent intent) {
        if (Build.VERSION.SDK_INT >= 33) return intent.getParcelableExtra(Intent.EXTRA_STREAM, Uri.class);
        Parcelable p = intent.getParcelableExtra(Intent.EXTRA_STREAM);
        return p instanceof Uri ? (Uri) p : null;
    }

    @SuppressWarnings("deprecation")
    private static ArrayList<Uri> streamListExtra(Intent intent) {
        if (Build.VERSION.SDK_INT >= 33) return intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM, Uri.class);
        return intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM);
    }

    /* ---------- קבצי פלט זמניים ---------- */

    /** יוצר קובץ ריק בשם הרצוי (בתיקייה ייחודית — כך השם נשמר גם בשיתוף) */
    @PluginMethod
    public void createTemp(PluginCall call) {
        try {
            File dir = new File(outDir(), UUID.randomUUID().toString());
            dir.mkdirs();
            File f = new File(dir, safeName(call.getString("name", "מסמך.pdf")));
            new FileOutputStream(f).close();
            JSObject ret = new JSObject();
            ret.put("path", f.getAbsolutePath());
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("יצירת קובץ זמני נכשלה", e);
        }
    }

    /** הוספת מקטע (Base64) לסוף קובץ זמני — הקובץ עובר מהממשק בחלקים */
    @PluginMethod
    public void appendTemp(PluginCall call) {
        try {
            File f = outFile(call.getString("path"));
            byte[] data = Base64.decode(call.getString("data", ""), Base64.DEFAULT);
            try (FileOutputStream out = new FileOutputStream(f, true)) {
                out.write(data);
            }
            call.resolve();
        } catch (Exception e) {
            call.reject("כתיבת הקובץ נכשלה", e);
        }
    }

    /** קובץ זמני חייב להיות בתוך תיקיית הפלט של האפליקציה */
    private File outFile(String path) throws IOException {
        if (path == null) throw new IOException("no path");
        File f = new File(path).getCanonicalFile();
        if (!f.getPath().startsWith(outDir().getCanonicalPath() + File.separator)) throw new IOException("bad path");
        return f;
    }

    private static String safeName(String name) {
        String n = name.replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]", "_").trim();
        if (n.isEmpty()) n = "מסמך.pdf";
        if (!n.toLowerCase().endsWith(".pdf")) n += ".pdf";
        return n;
    }

    private void copyToUri(File src, Uri uri) throws IOException {
        ContentResolver cr = getContext().getContentResolver();
        IOException last = null;
        // "wt" מקצר את הקובץ; ספקים מסוימים מכירים רק "rwt" או "w"
        for (String mode : new String[] { "wt", "rwt", "w" }) {
            try (InputStream in = new FileInputStream(src); OutputStream out = cr.openOutputStream(uri, mode)) {
                if (out == null) throw new IOException("open failed");
                byte[] buf = new byte[1 << 16];
                int n;
                while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
                return;
            } catch (IllegalArgumentException | UnsupportedOperationException e) {
                last = new IOException(e);
            } catch (IOException e) {
                last = e;
            }
        }
        throw last != null ? last : new IOException("write failed");
    }

    /* ---------- שמירה ---------- */

    /** שמירה מעל קובץ קיים (הקובץ המקורי) */
    @PluginMethod
    public void writeToUri(PluginCall call) {
        io.execute(() -> {
            try {
                copyToUri(outFile(call.getString("path")), Uri.parse(call.getString("uri")));
                call.resolve();
            } catch (SecurityException e) {
                call.reject("אין הרשאה לשנות את הקובץ המקורי", "NO_PERMISSION", e);
            } catch (Exception e) {
                Logger.error("EitanFiles", "writeToUri", e);
                call.reject("השמירה נכשלה", e);
            }
        });
    }

    /** "שמור בשם": המשתמש בוחר מקום ושם, והקובץ הזמני מועתק לשם */
    @PluginMethod
    public void saveAs(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("application/pdf");
        intent.putExtra(Intent.EXTRA_TITLE, safeName(call.getString("name", "מסמך.pdf")));
        startActivityForResult(call, intent, "saveAsResult");
    }

    @ActivityCallback
    private void saveAsResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        Intent data = result.getData();
        if (result.getResultCode() != android.app.Activity.RESULT_OK || data == null || data.getData() == null) {
            JSObject ret = new JSObject();
            ret.put("cancelled", true);
            call.resolve(ret);
            return;
        }
        Uri uri = data.getData();
        keepPermission(uri);
        io.execute(() -> {
            try {
                copyToUri(outFile(call.getString("path")), uri);
                JSObject ret = new JSObject();
                ret.put("uri", uri.toString());
                ret.put("name", displayName(uri));
                ret.put("writable", canWrite(uri));
                call.resolve(ret);
            } catch (Exception e) {
                Logger.error("EitanFiles", "saveAs", e);
                call.reject("השמירה נכשלה", e);
            }
        });
    }

    /** שמירת כמה קבצים לתיקייה שהמשתמש בוחר (פיצול) */
    @PluginMethod
    public void saveToFolder(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        intent.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);
        startActivityForResult(call, intent, "saveToFolderResult");
    }

    @ActivityCallback
    private void saveToFolderResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        Intent data = result.getData();
        if (result.getResultCode() != android.app.Activity.RESULT_OK || data == null || data.getData() == null) {
            JSObject ret = new JSObject();
            ret.put("cancelled", true);
            call.resolve(ret);
            return;
        }
        Uri tree = data.getData();
        io.execute(() -> {
            try {
                ContentResolver cr = getContext().getContentResolver();
                Uri parent = DocumentsContract.buildDocumentUriUsingTree(tree, DocumentsContract.getTreeDocumentId(tree));
                JSONArray files = call.getArray("files");
                int count = 0;
                for (int i = 0; i < files.length(); i++) {
                    JSONObject f = files.getJSONObject(i);
                    File src = outFile(f.getString("path"));
                    Uri doc = DocumentsContract.createDocument(cr, parent, "application/pdf", src.getName());
                    if (doc == null) throw new IOException("create failed");
                    copyToUri(src, doc);
                    count++;
                }
                JSObject ret = new JSObject();
                ret.put("count", count);
                call.resolve(ret);
            } catch (Exception e) {
                Logger.error("EitanFiles", "saveToFolder", e);
                call.reject("השמירה לתיקייה נכשלה", e);
            }
        });
    }

    /** שיתוף קבצים (וואטסאפ, מייל…) */
    @PluginMethod
    public void share(PluginCall call) {
        try {
            JSONArray files = call.getArray("files");
            ArrayList<Uri> uris = new ArrayList<>();
            String authority = getContext().getPackageName() + ".fileprovider";
            for (int i = 0; i < files.length(); i++) {
                File f = outFile(files.getJSONObject(i).getString("path"));
                uris.add(FileProvider.getUriForFile(getContext(), authority, f));
            }
            if (uris.isEmpty()) throw new IOException("no files");
            Intent send;
            if (uris.size() == 1) {
                send = new Intent(Intent.ACTION_SEND);
                send.putExtra(Intent.EXTRA_STREAM, uris.get(0));
            } else {
                send = new Intent(Intent.ACTION_SEND_MULTIPLE);
                send.putParcelableArrayListExtra(Intent.EXTRA_STREAM, uris);
            }
            send.setType("application/pdf");
            ClipData clip = ClipData.newRawUri("", uris.get(0));
            for (int i = 1; i < uris.size(); i++) clip.addItem(new ClipData.Item(uris.get(i)));
            send.setClipData(clip);
            send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            Intent chooser = Intent.createChooser(send, null);
            chooser.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            getActivity().startActivity(chooser);
            call.resolve();
        } catch (Exception e) {
            Logger.error("EitanFiles", "share", e);
            call.reject("השיתוף נכשל", e);
        }
    }

    /* ---------- העתקה למטמון ---------- */

    private JSArray importAll(List<Uri> uris) throws Exception {
        JSArray out = new JSArray();
        for (Uri u : uris) out.put(importOne(u));
        return out;
    }

    private JSObject importOne(Uri uri) throws Exception {
        ContentResolver cr = getContext().getContentResolver();
        File dest = new File(incomingDir(), UUID.randomUUID().toString() + ".pdf");
        long size = 0;
        try (InputStream in = cr.openInputStream(uri); OutputStream out = new FileOutputStream(dest)) {
            if (in == null) throw new Exception("open failed");
            byte[] buf = new byte[1 << 16];
            int n;
            while ((n = in.read(buf)) > 0) {
                out.write(buf, 0, n);
                size += n;
            }
        }
        JSObject f = new JSObject();
        f.put("path", dest.getAbsolutePath());
        f.put("uri", uri.toString());
        f.put("name", displayName(uri));
        f.put("size", size);
        f.put("writable", canWrite(uri));
        return f;
    }

    private boolean canWrite(Uri uri) {
        if (!ContentResolver.SCHEME_CONTENT.equals(uri.getScheme())) return false;
        return (
            getContext().checkCallingOrSelfUriPermission(uri, Intent.FLAG_GRANT_WRITE_URI_PERMISSION) == PackageManager.PERMISSION_GRANTED
        );
    }

    private String displayName(Uri uri) {
        String name = null;
        if (ContentResolver.SCHEME_CONTENT.equals(uri.getScheme())) {
            try (Cursor c = getContext().getContentResolver().query(uri, new String[] { OpenableColumns.DISPLAY_NAME }, null, null, null)) {
                if (c != null && c.moveToFirst()) name = c.getString(0);
            } catch (Exception ignored) {
                // ספקים מסוימים לא מחזירים שם
            }
        }
        if (name == null || name.isEmpty()) name = uri.getLastPathSegment();
        if (name == null || name.isEmpty()) name = "מסמך.pdf";
        int slash = name.lastIndexOf('/');
        if (slash >= 0) name = name.substring(slash + 1);
        return name;
    }
}
