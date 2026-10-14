const cacheKey = (userId) => `osha-cw-avatar:${userId}`;

export function readProfilePhoto(authUser) {
  const metadata = authUser?.user_metadata || {};
  if (metadata.oshaHubAvatarDeleted === true) return '';
  if (typeof metadata.oshaHubAvatar === 'string' && metadata.oshaHubAvatar) return metadata.oshaHubAvatar;
  if (!authUser?.id) return '';
  try {
    return window.localStorage.getItem(cacheKey(authUser.id)) || '';
  } catch {
    return '';
  }
}

export function cacheProfilePhoto(userId, photo) {
  if (!userId) return;
  try {
    if (photo) window.localStorage.setItem(cacheKey(userId), photo);
    else window.localStorage.removeItem(cacheKey(userId));
  } catch {
    // Supabase user metadata remains the durable source when browser storage is unavailable.
  }
}
