package com.salama.lock.domain.enums;

/**
 * Device lifecycle / operational state.
 * Terminal / non-commandable: {@link #SUSPENDED}, {@link #DEACTIVATED}, {@link #RETIRED}.
 */
public enum DeviceStatus {
    REGISTERED,
    ACTIVE,
    UNLOCKED,
    LOCKED,
    SUSPENDED,
    DEACTIVATED,
    RETIRED,
    UNKNOWN;

    public boolean acceptsCommands() {
        return this != SUSPENDED && this != DEACTIVATED && this != RETIRED;
    }
}
