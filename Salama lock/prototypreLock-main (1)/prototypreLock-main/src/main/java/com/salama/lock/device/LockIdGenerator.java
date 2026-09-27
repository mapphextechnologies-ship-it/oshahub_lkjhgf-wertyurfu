package com.salama.lock.device;

import java.security.SecureRandom;
import org.springframework.stereotype.Component;

/**
 * Generates permanent Salama lock IDs of the form {@code SL-<ULID>}.
 * Example: {@code SL-01K5A8FYD4QQ8E4T2G5S6H1C8P}
 *
 * <p>ULIDs are 128-bit Crockford Base32 values — time-sortable and collision-resistant.
 * Never derived from IMEI or other hardware identifiers.
 */
@Component
public class LockIdGenerator {

    private static final String PREFIX = "SL-";
    private static final char[] CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ".toCharArray();

    private final SecureRandom random = new SecureRandom();

    public String generate() {
        return PREFIX + encodeUlid(System.currentTimeMillis(), randomEntropy());
    }

    private byte[] randomEntropy() {
        byte[] entropy = new byte[10];
        random.nextBytes(entropy);
        return entropy;
    }

    static String encodeUlid(long timestampMs, byte[] entropy) {
        if (entropy == null || entropy.length != 10) {
            throw new IllegalArgumentException("ULID entropy must be 10 bytes");
        }
        char[] out = new char[26];

        // 48-bit timestamp → 10 chars
        long ts = timestampMs & 0xFFFF_FFFF_FFFFL;
        for (int i = 9; i >= 0; i--) {
            out[i] = CROCKFORD[(int) (ts & 0x1F)];
            ts >>>= 5;
        }

        // 80-bit entropy → 16 chars
        int bitBuffer = 0;
        int bitCount = 0;
        int idx = 10;
        for (byte b : entropy) {
            bitBuffer = (bitBuffer << 8) | (b & 0xFF);
            bitCount += 8;
            while (bitCount >= 5) {
                bitCount -= 5;
                out[idx++] = CROCKFORD[(bitBuffer >>> bitCount) & 0x1F];
            }
        }
        if (bitCount > 0) {
            out[idx] = CROCKFORD[(bitBuffer << (5 - bitCount)) & 0x1F];
        }
        return new String(out);
    }
}
