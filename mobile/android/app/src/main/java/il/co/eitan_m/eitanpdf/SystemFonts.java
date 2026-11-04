package il.co.eitan_m.eitanpdf;

import android.graphics.Paint;
import android.graphics.Typeface;
import java.io.File;
import java.io.RandomAccessFile;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * הגופנים שמותקנים בטלפון (/system/fonts ודומיהן) — לבחירת גופן בתיבות טקסט.
 *
 * מכל קובץ TTF/OTF נקראים רק הכותרות: שם המשפחה (טבלת name), המשקל והאם נטוי (טבלת OS/2).
 * תמיכה בעברית נבדקת דרך Paint.hasGlyph. התוצאה מקובצת לפי משפחה: קובץ רגיל וקובץ מודגש.
 * קובצי TTC (כמה גופנים בקובץ אחד) לא נכללים — אי אפשר להטמיע אותם ב-PDF כמו שהם.
 */
final class SystemFonts {
    static final class Face {
        String family;
        int weight = 400;
        boolean italic;
        String path;
    }

    static final class Family {
        String family;
        boolean hebrew;
        String regular;
        String bold;
    }

    private static List<Family> cache;

    private static final String[] DIRS = { "/system/fonts", "/product/fonts", "/system/product/fonts" };
    private static final long MAX_SIZE = 15L * 1024 * 1024;

    static synchronized List<Family> list() {
        if (cache != null) return cache;
        Map<String, List<Face>> byFamily = new LinkedHashMap<>();
        for (String d : DIRS) {
            File[] files = new File(d).listFiles();
            if (files == null) continue;
            for (File f : files) {
                String n = f.getName().toLowerCase();
                if (!(n.endsWith(".ttf") || n.endsWith(".otf")) || f.length() > MAX_SIZE) continue;
                Face face = read(f);
                if (face == null || face.family.isEmpty()) continue;
                List<Face> l = byFamily.get(face.family);
                if (l == null) byFamily.put(face.family, l = new ArrayList<>());
                l.add(face);
            }
        }
        List<Family> out = new ArrayList<>();
        Paint paint = new Paint();
        for (Map.Entry<String, List<Face>> e : byFamily.entrySet()) {
            List<Face> pool = new ArrayList<>();
            for (Face f : e.getValue()) if (!f.italic) pool.add(f);
            if (pool.isEmpty()) pool = e.getValue();
            Face regular = nearest(pool, 400, null);
            List<Face> bolds = new ArrayList<>();
            for (Face f : pool) if (f.weight >= 600 && f != regular) bolds.add(f);
            Face bold = bolds.isEmpty() ? null : nearest(bolds, 700, null);
            Family fam = new Family();
            fam.family = e.getKey();
            fam.regular = regular.path;
            fam.bold = bold == null ? null : bold.path;
            try {
                paint.setTypeface(Typeface.createFromFile(regular.path));
                fam.hebrew = paint.hasGlyph("א") && paint.hasGlyph("ת");
            } catch (Exception ex) {
                continue;
            }
            out.add(fam);
        }
        cache = out;
        return out;
    }

    static String pathOf(String family, boolean bold) {
        for (Family f : list()) {
            if (f.family.equals(family)) return bold && f.bold != null ? f.bold : f.regular;
        }
        return null;
    }

    static boolean hasBold(String family) {
        for (Family f : list()) if (f.family.equals(family)) return f.bold != null;
        return false;
    }

    private static Face nearest(List<Face> l, int w, Face skip) {
        Face best = null;
        for (Face f : l) {
            if (f == skip) continue;
            if (best == null || Math.abs(f.weight - w) < Math.abs(best.weight - w)) best = f;
        }
        return best;
    }

    /* ---------- קריאת הכותרות של קובץ הגופן ---------- */

    private static Face read(File file) {
        try (RandomAccessFile r = new RandomAccessFile(file, "r")) {
            int tag = r.readInt();
            if (tag != 0x00010000 && tag != 0x4F54544F /* OTTO */ && tag != 0x74727565 /* true */) return null;
            int numTables = r.readUnsignedShort();
            r.skipBytes(6);
            long nameOff = -1, os2Off = -1;
            for (int i = 0; i < numTables; i++) {
                int t = r.readInt();
                r.readInt(); // checksum
                long off = r.readInt() & 0xFFFFFFFFL;
                r.readInt(); // length
                if (t == 0x6E616D65) nameOff = off; // name
                else if (t == 0x4F532F32) os2Off = off; // OS/2
            }
            if (nameOff < 0) return null;
            Face face = new Face();
            face.path = file.getAbsolutePath();
            face.family = family(r, nameOff);
            if (face.family == null || face.family.startsWith(".")) return null;
            if (os2Off >= 0) {
                r.seek(os2Off + 4);
                face.weight = r.readUnsignedShort();
                r.seek(os2Off + 62);
                int sel = r.readUnsignedShort();
                face.italic = (sel & 0x1) != 0 || (sel & 0x200) != 0;
            }
            return face;
        } catch (Exception e) {
            return null;
        }
    }

    /** שם המשפחה: Typographic Family (16) ואם אין — Family (1). עדיפות לאנגלית של Windows */
    private static String family(RandomAccessFile r, long base) throws Exception {
        r.seek(base);
        r.readUnsignedShort(); // format
        int count = r.readUnsignedShort();
        int strOff = r.readUnsignedShort();
        String best16 = null, best1 = null;
        int score16 = -1, score1 = -1;
        for (int i = 0; i < count; i++) {
            r.seek(base + 6 + i * 12L);
            int platform = r.readUnsignedShort();
            int encoding = r.readUnsignedShort();
            int lang = r.readUnsignedShort();
            int id = r.readUnsignedShort();
            int len = r.readUnsignedShort();
            int off = r.readUnsignedShort();
            if (id != 1 && id != 16) continue;
            int score = platform == 3 && lang == 0x409 ? 3 : platform == 3 ? 2 : platform == 1 && lang == 0 ? 1 : 0;
            if ((id == 16 && score <= score16) || (id == 1 && score <= score1)) continue;
            byte[] b = new byte[len];
            r.seek(base + strOff + off);
            r.readFully(b);
            String s = platform == 3 || platform == 0 ? new String(b, StandardCharsets.UTF_16BE) : new String(b, StandardCharsets.ISO_8859_1);
            s = s.trim();
            if (s.isEmpty()) continue;
            if (id == 16) { best16 = s; score16 = score; } else { best1 = s; score1 = score; }
        }
        return best16 != null ? best16 : best1;
    }
}
