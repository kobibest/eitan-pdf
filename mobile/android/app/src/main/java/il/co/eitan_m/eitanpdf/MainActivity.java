package il.co.eitan_m.eitanpdf;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // התוסף המקומי של איתןPDF — חייב להירשם לפני super.onCreate
        registerPlugin(EitanFilesPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
