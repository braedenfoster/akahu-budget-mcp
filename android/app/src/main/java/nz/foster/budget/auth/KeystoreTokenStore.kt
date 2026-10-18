package nz.foster.budget.auth

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import kotlinx.serialization.json.Json

/** Stores the [Session] as AES-GCM ciphertext. The key lives in Android Keystore and survives reboots. */
class KeystoreTokenStore(context: Context) : TokenStore {
    private val prefs = context.getSharedPreferences("auth_session", Context.MODE_PRIVATE)
    private val json = Json { ignoreUnknownKeys = true }

    override fun load(): Session? {
        val encoded = prefs.getString(KEY_SESSION, null) ?: return null
        return try {
            val bytes = Base64.decode(encoded, Base64.NO_WRAP)
            val iv = bytes.copyOfRange(0, IV_BYTES)
            val cipher = Cipher.getInstance(TRANSFORMATION)
            cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(TAG_BITS, iv))
            val plain = cipher.doFinal(bytes, IV_BYTES, bytes.size - IV_BYTES)
            json.decodeFromString(Session.serializer(), plain.decodeToString())
        } catch (e: Exception) {
            // An unreadable session (key wiped, data corrupt) counts as signed out.
            clear()
            null
        }
    }

    override fun save(session: Session) {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, key())
        val sealed = cipher.iv + cipher.doFinal(json.encodeToString(Session.serializer(), session).encodeToByteArray())
        prefs.edit().putString(KEY_SESSION, Base64.encodeToString(sealed, Base64.NO_WRAP)).commit()
    }

    override fun clear() {
        prefs.edit().remove(KEY_SESSION).commit()
    }

    private fun key(): SecretKey {
        val keyStore = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }
        (keyStore.getKey(KEY_ALIAS, null) as? SecretKey)?.let { return it }
        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEYSTORE)
        generator.init(
            KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build(),
        )
        return generator.generateKey()
    }

    private companion object {
        const val ANDROID_KEYSTORE = "AndroidKeyStore"
        const val KEY_ALIAS = "budget_session"
        const val KEY_SESSION = "session"
        const val TRANSFORMATION = "AES/GCM/NoPadding"
        const val IV_BYTES = 12
        const val TAG_BITS = 128
    }
}
