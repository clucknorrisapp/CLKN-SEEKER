package app.clucknorris.school;

import com.getcapacitor.BridgeActivity;

// The EDUCATION targets (Google Play / iOS edition, -PclknWallet=false) compile THIS activity.
// It registers no plugins: the Mobile Wallet Adapter bridge lives in src/wallet/java and is not
// on this build's source path, and its library is not a dependency of this build, so the
// education APK has no wallet code in it at all — not "unused", absent. The wallet MainActivity
// is src/wallet/java/app/clucknorris/school/MainActivity.java; build.gradle picks one or the
// other from the `clknWallet` Gradle property (default: wallet, so the Solana and Seeker
// targets are unchanged).
public class MainActivity extends BridgeActivity {}
