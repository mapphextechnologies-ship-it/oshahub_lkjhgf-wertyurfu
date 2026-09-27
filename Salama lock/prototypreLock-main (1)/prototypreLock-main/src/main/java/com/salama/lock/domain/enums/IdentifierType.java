package com.salama.lock.domain.enums;

/**
 * Hardware / platform identifiers attached to a device.
 * All provider-facing IDs live here — not as columns on {@code devices}.
 */
public enum IdentifierType {
    IMEI,
    SERIAL,
    GOOGLE_DEVICE_ID,
    GOOGLE_LOCK_ID,
    ANDROID_ID,
    MAC,
    OTHER
}
