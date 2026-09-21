package app.clucknorris.school.mwa

import android.net.Uri
import android.util.Base64
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.solana.mobilewalletadapter.clientlib.ActivityResultSender
import com.solana.mobilewalletadapter.clientlib.ConnectionIdentity
import com.solana.mobilewalletadapter.clientlib.DefaultTransactionParams
import com.solana.mobilewalletadapter.clientlib.MobileWalletAdapter
import com.solana.mobilewalletadapter.clientlib.Solana
import com.solana.mobilewalletadapter.clientlib.TransactionParams
import com.solana.mobilewalletadapter.clientlib.TransactionResult
import com.solana.mobilewalletadapter.clientlib.protocol.JsonRpc20Client
import com.solana.mobilewalletadapter.clientlib.protocol.MobileWalletAdapterClient
import com.solana.mobilewalletadapter.common.ProtocolContract
import com.solana.mobilewalletadapter.common.util.Base58
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import java.util.concurrent.CancellationException

/**
 * CluckMWA — the native half of the Mobile Wallet Adapter bridge.
 *
 * The JS-side contract this plugin implements lives in cluck-norris-school's
 * `public/cluck-wallet.js` (search that file for "CluckMWA" / "mwaBridge"). That file's own
 * comment block is the actual specification; everything below is written to match it exactly,
 * not the other way around. Do not change a method name, parameter name, or return shape here
 * without changing it there first (and in `docs/MWA_PLUGIN.md` in this repo).
 *
 * Registered by hand in MainActivity.onCreate() — see the comment there for why (this class
 * lives inside the app, not as an installed Capacitor plugin package, so Capacitor's plugin
 * auto-discovery never finds it on its own).
 *
 * Wire contract (every method returns a Promise on the JS side):
 *   authorize({ cluster, identity })                              -> { address, authToken }
 *   reauthorize({ authToken })                                     -> { address, authToken }
 *   deauthorize({ authToken })                                     -> {}
 *   signTransactions({ authToken, transactions })                  -> { signedTransactions }  (base64[])
 *   signAndSendTransactions({ authToken, transactions, options })  -> { signatures }          (base58[])
 *   signMessages({ authToken, addresses, messages })                -> { signedMessages }      (base64[])
 *
 * `address`, entries of `transactions`, `signedTransactions`, `messages`, `signedMessages`, and
 * addresses are BASE64. Entries of `signatures` (from signAndSendTransactions only) are BASE58.
 * That asymmetry is deliberate (see cluck-wallet.js) — it matches the Phantom-shaped provider
 * object the web layer builds on top of this bridge, where signAndSendTransaction's `signature`
 * is conventionally a base58 tx signature and everything else on that provider is base64. Do not
 * "fix" it into a single encoding.
 *
 * Errors: a rejected call's `code` is one of:
 *   MWA_NO_WALLET   — no MWA-capable wallet app is installed / reachable on this device.
 *   MWA_CANCELLED   — the user backed out of the wallet's own UI (association intent dismissed,
 *                     or the wallet reported "not signed"). A normal outcome, not a bug.
 *   MWA_INVALID_ARGS — the call from JS was missing or malformed (a bug on the JS side, or a
 *                     stale caller using an old contract shape).
 *   MWA_FAILED      — any other failure (network/session error, protocol error, wallet declined
 *                     for a reason that isn't "cancelled", timeout, ...). The rejection message
 *                     carries the library's own diagnostic string.
 *
 * Money-safety invariants this file must keep:
 *   - Never sign anything the JS caller did not pass. Every transaction/message byte array here
 *     is exactly what arrived from `call.getArray(...)`, base64-decoded and handed to the client
 *     library unmodified. Nothing is synthesized, merged, or reused across calls.
 *   - Never re-order or re-encode beyond the base64<->bytes / bytes<->base58 conversions the
 *     contract itself requires.
 *   - Never log a transaction, a signature, a seed/keypair, or an authToken. (Grep this file for
 *     "Log." before adding one — there should be none touching those values.)
 *   - Never persist authToken. The web layer (cluck-wallet.js) owns session lifetime; this class
 *     only ever holds an authToken for the duration of one suspend call, as a local variable /
 *     method parameter — never a field, never written to disk or SharedPreferences.
 */
@CapacitorPlugin(name = "CluckMWA")
class CluckMWAPlugin : Plugin() {

    // One scope for the plugin's lifetime (== one Activity instance's lifetime), so an in-flight
    // MWA session gets cancelled cleanly if the Activity goes away instead of leaking a coroutine
    // that touches a dead Activity. Dispatchers.Main because ActivityResultSender's own
    // registerForActivityResult / lifecycle.whenResumed calls are main-thread AndroidX Activity
    // APIs; the library switches to its own IO dispatcher internally for the actual socket I/O
    // (see MobileWalletAdapter's `ioDispatcher` default of Dispatchers.IO upstream).
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)

    // Constructed once, in load() — see the big comment on that method for why it cannot be
    // built lazily inside a plugin method instead.
    private lateinit var sender: ActivityResultSender

    // ConnectionIdentity is an immutable constructor argument on MobileWalletAdapter, but three
    // of the six bridge methods (signTransactions / signAndSendTransactions / signMessages) take
    // no identity parameter at all per the contract above — only authToken. MWA still needs SOME
    // identity to reauthorize under the hood before it will sign (that's how the protocol works:
    // every transact() session starts with an authorize-or-reauthorize step). So we remember the
    // identity most recently supplied by a real authorize()/reauthorize() call from JS and reuse
    // it for those three. In normal operation cluck-wallet.js always sends the exact same fixed
    // identity object (see its `mwaIdentity()`), so this is really "the app's one identity",
    // just sourced from JS instead of hardcoded here, so the two can never drift apart.
    // FALLBACK_IDENTITY is only used if a sign call somehow arrives before any authorize call
    // ever succeeded in this process — the JS layer's own `need()` check (in cluck-wallet.js)
    // should make that unreachable, since it refuses to call any sign method before `connect()`
    // has resolved, but a native plugin should not crash on a JS-side bug either.
    @Volatile
    private var lastIdentity: ConnectionIdentity = FALLBACK_IDENTITY

    override fun load() {
        // Runs synchronously inside BridgeActivity.onCreate() (Plugin.load() is called from
        // PluginHandle's constructor, which Bridge.Builder.create() runs while building the
        // Bridge — see Bridge.registerPlugin() -> new PluginHandle(...) -> load() ->
        // initializeActivityLaunchers()), i.e. strictly before the Activity reaches STARTED.
        //
        // This timing matters because ActivityResultSender's constructor calls
        // ComponentActivity.registerForActivityResult(...) internally, and AndroidX's
        // ActivityResultRegistry throws IllegalStateException ("LifecycleOwners must call
        // register before they are STARTED") if that happens any later. Building `sender` here
        // — once, for the life of this Activity/plugin instance — instead of lazily inside
        // authorize()/signTransactions()/etc. is what keeps that safe. Do not move this.
        sender = ActivityResultSender(activity)
    }

    override fun handleOnDestroy() {
        scope.cancel()
    }

    // ── authorize / reauthorize ────────────────────────────────────────────────────────────
    // Both map to the exact same underlying operation: MobileWalletAdapter.transact()'s own
    // associate() step authorizes when adapter.authToken is null and reauthorizes when it is
    // set (see MobileWalletAdapter.kt upstream) — so the only difference between our two bridge
    // methods is which authToken (none, or the one JS hands back) we seed the adapter with
    // before calling transact(sender) {}. That empty trailing lambda is deliberate: it is
    // exactly what the library's own `connect()` convenience extension does, and here we need
    // the fuller transact() form (not connect()) purely to reach the identity/cluster/authToken
    // parameters as call-site locals.

    @PluginMethod
    fun authorize(call: PluginCall) {
        connectOrReauthorize(call, existingAuthToken = null)
    }

    @PluginMethod
    fun reauthorize(call: PluginCall) {
        val authToken = call.getString("authToken")
        if (authToken.isNullOrEmpty()) {
            call.reject("reauthorize requires authToken", CODE_INVALID_ARGS)
            return
        }
        // reauthorize({ authToken }) per the contract carries no identity — cluck-wallet.js's
        // provider only ever calls this with an authToken it already holds from a prior
        // authorize(), so we reuse the identity remembered from that call rather than requiring
        // JS to resend it every time.
        connectOrReauthorize(call, existingAuthToken = authToken, identityOverride = null)
    }

    private fun connectOrReauthorize(
        call: PluginCall,
        existingAuthToken: String?,
        identityOverride: JSObject? = call.getObject("identity"),
    ) {
        val identity: ConnectionIdentity
        if (identityOverride != null) {
            identity = try {
                parseIdentity(identityOverride)
            } catch (e: Exception) {
                call.reject("Invalid identity: ${e.message}", CODE_INVALID_ARGS)
                return
            }
        } else if (existingAuthToken != null) {
            identity = lastIdentity
        } else {
            call.reject("authorize requires identity", CODE_INVALID_ARGS)
            return
        }

        val adapter = MobileWalletAdapter(identity)
        adapter.blockchain = blockchainFor(call.getString("cluster"))
        adapter.authToken = existingAuthToken

        scope.launch {
            val result = adapter.transact(sender) { /* authorize/reauthorize already ran */ }
            when (result) {
                is TransactionResult.Success -> {
                    val auth = result.authResult
                    val account = auth.accounts.firstOrNull()
                    if (account == null) {
                        call.reject("Wallet authorized with no account", CODE_FAILED)
                        return@launch
                    }
                    lastIdentity = identity
                    val ret = JSObject()
                    ret.put("address", Base64.encodeToString(account.publicKey, Base64.NO_WRAP))
                    ret.put("authToken", auth.authToken)
                    call.resolve(ret)
                }
                is TransactionResult.NoWalletFound -> call.reject(result.message, CODE_NO_WALLET)
                is TransactionResult.Failure -> rejectFailure(call, result)
            }
        }
    }

    // ── deauthorize ────────────────────────────────────────────────────────────────────────

    @PluginMethod
    fun deauthorize(call: PluginCall) {
        val authToken = call.getString("authToken")
        if (authToken.isNullOrEmpty()) {
            // Nothing to deauthorize; treat as already-done rather than an error. The JS caller
            // (cluck-wallet.js disconnect()) already `.catch()`s this call, but there is no
            // reason to manufacture a failure for a no-op.
            call.resolve(JSObject())
            return
        }

        val adapter = MobileWalletAdapter(lastIdentity)
        adapter.blockchain = Solana.Mainnet // see the big comment on this in signTransactions()
        adapter.authToken = authToken

        scope.launch {
            // disconnect() is the library's own ktx convenience: it opens a local association
            // (no authorize/reauthorize step — deauthorize doesn't need one) and calls
            // deauthorize(authToken) inside it. See MobileWalletAdapter.kt upstream.
            val result = adapter.disconnect(sender)
            when (result) {
                is TransactionResult.Success -> call.resolve(JSObject())
                is TransactionResult.NoWalletFound -> call.reject(result.message, CODE_NO_WALLET)
                is TransactionResult.Failure -> rejectFailure(call, result)
            }
        }
    }

    // ── signTransactions ───────────────────────────────────────────────────────────────────

    @PluginMethod
    fun signTransactions(call: PluginCall) {
        val authToken = call.getString("authToken")
        if (authToken.isNullOrEmpty()) {
            call.reject("signTransactions requires authToken", CODE_INVALID_ARGS)
            return
        }
        val txBytes = try {
            decodeBase64Array(call.getArray("transactions"), "transactions")
        } catch (e: IllegalArgumentException) {
            call.reject(e.message, CODE_INVALID_ARGS)
            return
        }

        val adapter = MobileWalletAdapter(lastIdentity)
        // MobileWalletAdapter.blockchain defaults to Solana.Devnet (see the library's own
        // DataModels.kt) — NOT mainnet — and this app is mainnet-only per the contract (`cluster`
        // is always "mainnet-beta"). This matters even here, on what is logically "just a
        // reauthorize": on an MWA protocol-1 wallet, associate() sends `chain` on every
        // authorize call including the implicit one transact() does before signing, so leaving
        // this at the library default would silently authorize/sign against the wrong network
        // context on those wallets. Always set it explicitly; never rely on the library default.
        adapter.blockchain = Solana.Mainnet
        adapter.authToken = authToken

        scope.launch {
            val result = adapter.transact(sender) { signTransactions(txBytes) }
            when (result) {
                is TransactionResult.Success -> {
                    val signed: Array<ByteArray> = result.payload.signedPayloads
                    val ret = JSObject()
                    ret.put("signedTransactions", base64Array(signed))
                    call.resolve(ret)
                }
                is TransactionResult.NoWalletFound -> call.reject(result.message, CODE_NO_WALLET)
                is TransactionResult.Failure -> rejectFailure(call, result)
            }
        }
    }

    // ── signAndSendTransactions ────────────────────────────────────────────────────────────

    @PluginMethod
    fun signAndSendTransactions(call: PluginCall) {
        val authToken = call.getString("authToken")
        if (authToken.isNullOrEmpty()) {
            call.reject("signAndSendTransactions requires authToken", CODE_INVALID_ARGS)
            return
        }
        val txBytes = try {
            decodeBase64Array(call.getArray("transactions"), "transactions")
        } catch (e: IllegalArgumentException) {
            call.reject(e.message, CODE_INVALID_ARGS)
            return
        }
        val params = parseTransactionParams(call.getObject("options"))

        val adapter = MobileWalletAdapter(lastIdentity)
        adapter.blockchain = Solana.Mainnet // see the big comment on this in signTransactions()
        adapter.authToken = authToken

        scope.launch {
            val result = adapter.transact(sender) { signAndSendTransactions(txBytes, params) }
            when (result) {
                is TransactionResult.Success -> {
                    // Raw 64-byte ed25519 signatures. The contract requires BASE58 here (to match
                    // the Phantom-shaped signAndSendTransaction() -> { signature } convention the
                    // web layer builds on) — everywhere else on this bridge is base64. Use the
                    // client library's own Base58 (com.solana.mobilewalletadapter.common.util.
                    // Base58), already a transitive dependency; do not add a second base58
                    // implementation or hand-roll one.
                    val signatures: Array<ByteArray> = result.payload.signatures
                    val arr = JSArray()
                    for (sig in signatures) arr.put(Base58.encode(sig))
                    val ret = JSObject()
                    ret.put("signatures", arr)
                    call.resolve(ret)
                }
                is TransactionResult.NoWalletFound -> call.reject(result.message, CODE_NO_WALLET)
                is TransactionResult.Failure -> rejectFailure(call, result)
            }
        }
    }

    // ── signMessages ───────────────────────────────────────────────────────────────────────

    @PluginMethod
    fun signMessages(call: PluginCall) {
        val authToken = call.getString("authToken")
        if (authToken.isNullOrEmpty()) {
            call.reject("signMessages requires authToken", CODE_INVALID_ARGS)
            return
        }
        val messageBytes = try {
            decodeBase64Array(call.getArray("messages"), "messages")
        } catch (e: IllegalArgumentException) {
            call.reject(e.message, CODE_INVALID_ARGS)
            return
        }
        val addressBytes = try {
            decodeBase64Array(call.getArray("addresses"), "addresses")
        } catch (e: IllegalArgumentException) {
            call.reject(e.message, CODE_INVALID_ARGS)
            return
        }

        val adapter = MobileWalletAdapter(lastIdentity)
        adapter.blockchain = Solana.Mainnet // see the big comment on this in signTransactions()
        adapter.authToken = authToken

        scope.launch {
            val result = adapter.transact(sender) { signMessagesDetached(messageBytes, addressBytes) }
            when (result) {
                is TransactionResult.Success -> {
                    // cluck-wallet.js's signMessage() treats signedMessages[i] as the raw
                    // SIGNATURE bytes (base64), not the signed message payload — it does
                    // `b64decode(signedMessages[0])` and hands that straight back as `signature`
                    // to match the standard Phantom signMessage() -> { signature, publicKey }
                    // shape. MobileWalletAdapterClient.SignMessagesResult.SignedMessage separates
                    // `.message` from `.signatures` (one signature per requested address) — we
                    // send exactly one address per message from this bridge (see cluck-wallet.js
                    // mwaProvider.signMessage), so `.signatures.first()` is the one we want. Do
                    // NOT return `.message` here — that would silently break the web layer, which
                    // never re-derives a signature from a message.
                    val messages: Array<MobileWalletAdapterClient.SignMessagesResult.SignedMessage> =
                        result.payload.messages
                    val arr = JSArray()
                    for (m in messages) {
                        val sig = m.signatures.firstOrNull()
                        if (sig == null) {
                            call.reject("Wallet returned a signed message with no signature", CODE_FAILED)
                            return@launch
                        }
                        arr.put(Base64.encodeToString(sig, Base64.NO_WRAP))
                    }
                    val ret = JSObject()
                    ret.put("signedMessages", arr)
                    call.resolve(ret)
                }
                is TransactionResult.NoWalletFound -> call.reject(result.message, CODE_NO_WALLET)
                is TransactionResult.Failure -> rejectFailure(call, result)
            }
        }
    }

    // ── shared helpers ─────────────────────────────────────────────────────────────────────

    /**
     * Maps a TransactionResult.Failure to a JS rejection, distinguishing "the user backed out"
     * from every other kind of failure by inspecting the underlying exception TYPE (not a
     * message string, which is not a documented/stable part of the library's public API surface
     * and could change wording between versions without changing behavior).
     *
     * This mirrors MobileWalletAdapter.associate()'s own catch clauses exactly (clientlib-ktx
     * 2.1.1, com/solana/mobilewalletadapter/clientlib/MobileWalletAdapter.kt):
     *   - InterruptedException            -> the OS activity-result flow reported RESULT_CANCELED
     *                                        before a wallet session was even established (the
     *                                        user dismissed the chooser / backed out immediately).
     *   - CancellationException, but NOT
     *     TimeoutCancellationException     -> the coroutine was cancelled outright (e.g. the
     *                                        Activity went away mid-flow). TimeoutCancellationException
     *                                        is excluded because the library also throws it for a
     *                                        genuine intent-send timeout, which is not the user
     *                                        choosing anything.
     *   - JsonRpc20RemoteException with
     *     code == ERROR_NOT_SIGNED         -> the wallet's own UI reported the user declined to
     *                                        sign/authorize. This is literally what
     *                                        ProtocolContract.ERROR_NOT_SIGNED means ("User did
     *                                        not authorize signing" — see MobileWalletAdapter.kt's
     *                                        own mapping of this code).
     * Everything else (auth-token-invalid, too-many-payloads, IO errors, protocol errors,
     * timeouts establishing the session, insecure wallet endpoint, ...) is a genuine failure and
     * is surfaced as MWA_FAILED with the library's own message.
     *
     * Caveat (see docs/MWA_PLUGIN.md "Unverified / could be wrong"): this depends on internal
     * exception shapes of mobile-wallet-adapter-clientlib-ktx that are not part of its documented
     * public contract, even though they are real, current source as of the pinned 2.1.1 release.
     * A future library version could restructure them; if cancellation ever stops being detected
     * correctly, this is the first place to look.
     */
    private fun rejectFailure(call: PluginCall, failure: TransactionResult.Failure<*>) {
        val e = failure.e
        val cancelled = e is InterruptedException ||
            (e is CancellationException && e !is TimeoutCancellationException) ||
            (e is JsonRpc20Client.JsonRpc20RemoteException && e.code == ProtocolContract.ERROR_NOT_SIGNED)
        call.reject(failure.message, if (cancelled) CODE_CANCELLED else CODE_FAILED)
    }

    private fun parseIdentity(identity: JSObject): ConnectionIdentity {
        val uriStr = identity.getString("uri")
            ?: throw IllegalArgumentException("identity.uri is required")
        val iconStr = identity.getString("icon")
            ?: throw IllegalArgumentException("identity.icon is required")
        val name = identity.getString("name")
            ?: throw IllegalArgumentException("identity.name is required")
        val identityUri = Uri.parse(uriStr)
        if (!identityUri.isAbsolute || !identityUri.isHierarchical) {
            throw IllegalArgumentException("identity.uri must be an absolute, hierarchical URI")
        }
        val iconUri = Uri.parse(iconStr)
        if (!iconUri.isRelative) {
            // Matches MobileWalletAdapterClient's own validation (it throws
            // IllegalArgumentException for a non-relative icon URI) — checked here first so the
            // error message names the actual field instead of surfacing as a generic MWA_FAILED
            // from deep inside the library.
            throw IllegalArgumentException("identity.icon must be a relative URI (e.g. \"/icon.svg\")")
        }
        return ConnectionIdentity(identityUri = identityUri, iconUri = iconUri, identityName = name)
    }

    private fun blockchainFor(cluster: String?) = when (cluster) {
        "testnet" -> Solana.Testnet
        "devnet" -> Solana.Devnet
        else -> Solana.Mainnet // "mainnet-beta", null, or anything else — this app is mainnet-only.
    }

    private fun decodeBase64Array(arr: JSArray?, fieldName: String): Array<ByteArray> {
        if (arr == null || arr.length() == 0) {
            throw IllegalArgumentException("$fieldName is required and must be non-empty")
        }
        return try {
            Array(arr.length()) { i -> Base64.decode(arr.getString(i), Base64.DEFAULT) }
        } catch (e: Exception) {
            throw IllegalArgumentException("$fieldName must be an array of base64 strings")
        }
    }

    private fun base64Array(payloads: Array<ByteArray>): JSArray {
        val arr = JSArray()
        for (p in payloads) arr.put(Base64.encodeToString(p, Base64.NO_WRAP))
        return arr
    }

    private fun parseTransactionParams(options: JSObject?): TransactionParams {
        if (options == null) return DefaultTransactionParams
        // Accepts both `commitment` and `preflightCommitment` — callers of the standard
        // wallet-adapter signAndSendTransaction(tx, options) shape sometimes use the latter.
        val commitment = options.getString("commitment") ?: options.getString("preflightCommitment")
        return TransactionParams(
            minContextSlot = options.getInteger("minContextSlot"),
            commitment = commitment,
            skipPreflight = options.getBool("skipPreflight"),
            maxRetries = options.getInteger("maxRetries"),
            waitForCommitmentToSendNextTransaction = options.getBool("waitForCommitmentToSendNextTransaction"),
        )
    }

    companion object {
        const val CODE_NO_WALLET = "MWA_NO_WALLET"
        const val CODE_CANCELLED = "MWA_CANCELLED"
        const val CODE_INVALID_ARGS = "MWA_INVALID_ARGS"
        const val CODE_FAILED = "MWA_FAILED"

        // Only reachable if a sign/deauthorize call arrives before any authorize call has ever
        // succeeded in this process — see the comment on `lastIdentity` above. The URI here is
        // deliberately the same one cluck-wallet.js's mwaIdentity() falls back to when
        // `location.origin` is unavailable, so if this constant is ever actually used, the
        // wallet-facing identity still names the real app rather than a placeholder.
        private val FALLBACK_IDENTITY = ConnectionIdentity(
            identityUri = Uri.parse("https://clucknorris.app"),
            iconUri = Uri.parse("/icon.svg"),
            identityName = "Cluck Norris",
        )
    }
}
