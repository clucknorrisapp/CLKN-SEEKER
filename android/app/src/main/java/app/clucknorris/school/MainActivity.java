package app.clucknorris.school;

import android.os.Bundle;
import app.clucknorris.school.mwa.CluckMWAPlugin;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // CluckMWA lives inside this app's own source (app/src/main/java/.../mwa/), not as a
        // separate installed Capacitor plugin package under node_modules — so it is never listed
        // in the generated capacitor.plugins.json / capacitor.settings.gradle and Capacitor's
        // plugin auto-discovery never sees it. This is Capacitor's own documented pattern for a
        // plugin that ships inside the app itself ("Custom Native Android Code"): register the
        // class explicitly, and do it BEFORE calling super.onCreate(), because BridgeActivity
        // .onCreate() is where the Bridge is actually built (via the bridgeBuilder field, which
        // already exists at this point from field initialization) and every registered plugin is
        // instantiated and has load() called on it — CluckMWAPlugin.load() is where the
        // ActivityResultSender gets constructed, and that must happen no later than this.
        registerPlugin(CluckMWAPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
